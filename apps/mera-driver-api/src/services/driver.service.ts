import type { Prisma } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';
import { HttpError } from '../middleware/errorHandler';
import { validateDriverPreferences } from './driver-preferences.service';
import { currentLicence } from './licence-policy.service';

const LINKED_USER_SELECT = { id: true, name: true, email: true, phone: true } as const;

/** The Driver onboarding form has 4 top-level tabs (Personal, Education & Health, Documents,
 *  Payment), each split into its own nested sub-steps — one persistence checkpoint per
 *  nested sub-step, not per tab. Counts MUST mirror `MAX_SUBS` in the frontend's
 *  `drivers.ts` exactly (tab 1 has 4 sub-steps, tab 2 has 2, tab 3 has 3, tab 4 has 2). */
const SUB_COUNTS = [4, 2, 3, 2];
const TOTAL_ONBOARDING_STEPS = SUB_COUNTS.length;
const TOTAL_SUBSTEPS = SUB_COUNTS.reduce((a, b) => a + b, 0);

/** Encodes a (tab, sub) pair as a single int for storage in `Driver.completedSubSteps`.
 *  `tab` is 1-based (1-4), `sub` is 0-based — safe because every tab has at most 4 sub-steps
 *  (0-3), so `tab*10+sub` never collides across tabs (11-14, 21-24, 31-34, 41-44). */
function encodeSubStep(tab: number, sub: number): number {
  return tab * 10 + sub;
}

function allSubStepsForTab(tab: number): number[] {
  return Array.from({ length: SUB_COUNTS[tab - 1] }, (_, sub) => encodeSubStep(tab, sub));
}

function allSubStepsUpToTab(tab: number): number[] {
  const keys: number[] = [];
  for (let t = 1; t <= tab; t++) keys.push(...allSubStepsForTab(t));
  return keys;
}

/**
 * The single source of truth for onboarding progress: given the definitive set of completed
 * (tab, sub) pairs, derives every other progress field. `completedSteps`/`currentStep`/
 * `currentSubStep`/`completionPercentage`/`onboardingStatus` are never written independently
 * of `completedSubSteps` — they're always recomputed from it here, so they can't drift.
 */
function deriveOnboardingFields(completedSubStepKeys: number[]) {
  const completedSubSteps = Array.from(new Set(completedSubStepKeys)).sort((a, b) => a - b);
  const isDone = completedSubSteps.length >= TOTAL_SUBSTEPS;

  const completedSteps: number[] = [];
  for (let tab = 1; tab <= TOTAL_ONBOARDING_STEPS; tab++) {
    if (allSubStepsForTab(tab).every((key) => completedSubSteps.includes(key))) completedSteps.push(tab);
  }

  let nextTab = TOTAL_ONBOARDING_STEPS;
  let nextSub = SUB_COUNTS[TOTAL_ONBOARDING_STEPS - 1] - 1;
  findNext: for (let tab = 1; tab <= TOTAL_ONBOARDING_STEPS; tab++) {
    for (let sub = 0; sub < SUB_COUNTS[tab - 1]; sub++) {
      if (!completedSubSteps.includes(encodeSubStep(tab, sub))) {
        nextTab = tab;
        nextSub = sub;
        break findNext;
      }
    }
  }

  return {
    completedSubSteps,
    completedSteps,
    currentStep: isDone ? TOTAL_ONBOARDING_STEPS : nextTab,
    currentSubStep: isDone ? SUB_COUNTS[TOTAL_ONBOARDING_STEPS - 1] - 1 : nextSub,
    completionPercentage: Math.round((completedSubSteps.length / TOTAL_SUBSTEPS) * 100),
    onboardingStatus: isDone ? 'completed' : 'in_progress',
  };
}

/** Resolves the set of newly-completed sub-step keys for a save, layering three cases:
 *  a precise (tab, sub) pair from the wizard's per-substep save, a legacy whole-tab
 *  `stepCompleted`-only call (marks every sub-step up to and including that tab), or no
 *  step info at all (a plain admin one-shot create with a fully-filled form). */
function resolveNewlyCompletedKeys(stepCompleted: number | undefined, subStepCompleted: number | undefined): number[] {
  if (stepCompleted != null && subStepCompleted != null && (stepCompleted < 1 || stepCompleted > SUB_COUNTS.length || subStepCompleted < 0 || subStepCompleted >= SUB_COUNTS[stepCompleted - 1])) {
    throw new HttpError(422, 'PILL_INVALID', 'The selected onboarding pill does not exist');
  }
  if (stepCompleted != null && subStepCompleted != null) return [encodeSubStep(stepCompleted, subStepCompleted)];
  if (stepCompleted != null) return allSubStepsUpToTab(stepCompleted);
  return allSubStepsUpToTab(TOTAL_ONBOARDING_STEPS);
}

/** `age` is never trusted from the client — always (re)derived from `dob` here. Whole years
 *  between `dob` and today; returns undefined if `dob` is absent/unparseable (the Zod schema
 *  already rejects a future `dob` before this ever runs). */
function deriveAge(dob: string | null | undefined): string | undefined {
  if (!dob) return undefined;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return String(age);
}

export async function listDrivers() {
  return prisma.driver.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: {
      documents: true,
      driverStatusMaster: { select: { id: true, name: true, status: true } },
      user: { select: LINKED_USER_SELECT },
      assignedVerifier: { select: LINKED_USER_SELECT },
    },
  });
}

export async function getDriverById(id: string, client: Prisma.TransactionClient = prisma) {
  const driver = await client.driver.findUnique({
    where: { id },
    include: {
      documents: true,
      driverStatusMaster: { select: { id: true, name: true, status: true } },
      user: { select: LINKED_USER_SELECT },
      assignedVerifier: { select: LINKED_USER_SELECT },
    },
  });
  if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
  return { ...driver, driverStatusName: driver.driverStatusMaster?.name ?? null };
}

/**
 * `stepCompleted`/`subStepCompleted` are stripped off before hitting Prisma — neither is a
 * Driver column, they're the signal that drives `deriveOnboardingFields`. Omitting both (the
 * driver's own `PATCH /drivers/me`) leaves onboarding progress untouched on update, so this
 * never regresses a driver's progress when someone edits them outside the step wizard. On
 * create, no step info at all means a plain one-shot add with a fully-filled form, so it's
 * treated as fully onboarded (there's no wizard session to resume).
 */
export interface DriverSaveContext { explicitApproval?:boolean; actorId?: string; canChangeStatus?: boolean }
const FEE_FIELDS = ['preferredPaymentMode','amount','paymentReceiptDate'];
async function validateBusinessStatus(input: Record<string,unknown>, existing: Record<string,unknown>, context: DriverSaveContext) {
  if (input.driverStatusMasterId === undefined || input.driverStatusMasterId === (existing.driverStatusMasterId ?? null)) return;
  if (!context.actorId || !context.canChangeStatus) throw new HttpError(403,'FORBIDDEN','Driver status-change permission required');
  if (existing.id && !String(input.driverStatusChangeReason ?? '').trim()) throw new HttpError(422,'STATUS_REASON_REQUIRED','Enter a driver status change reason');
  if (input.driverStatusMasterId !== null) {
    const option = await prisma.masterListItem.findUnique({where:{id:String(input.driverStatusMasterId)}});
    if (!option || option.category !== 'statuses' || option.status !== 'Active') throw new HttpError(422,'MASTER_OPTION_INVALID','Choose an active option from the existing Driver Status Master');
  }
}

export async function createDriver(input: Record<string, unknown>, context: DriverSaveContext = {}, client: Prisma.TransactionClient = prisma) {
  await validateBusinessStatus(input, {}, context);
  const feeChoice = input.registrationFeeEntryChoice;
  if (feeChoice === 'Unpaid') for (const key of FEE_FIELDS) delete input[key];
  await validateDriverPreferences(input);
  if (input.status === 'Verified' && input.stepCompleted == null) throw new HttpError(422, 'KYC_REVIEW_REQUIRED', 'Create and review the driver before final approval');
  const { stepCompleted, subStepCompleted, completeStep, age: _clientAge, registrationFeeEntryChoice, driverStatusChangeReason, ...data } = input as Record<string, unknown> & {
    stepCompleted?: number;
    subStepCompleted?: number;
    completeStep?: boolean;
    age?: unknown;
  };
  // An onboarding form cannot perform a staff KYC decision, even with a stale status.
  if (stepCompleted != null) delete data.status;
  const onboarding = deriveOnboardingFields(completeStep === false ? [] : resolveNewlyCompletedKeys(stepCompleted, subStepCompleted));
  const derivedAge = deriveAge(data.dob as string | undefined);
  const driver = await client.driver.create({
    data: { ...data, ...onboarding, ...(derivedAge !== undefined ? { age: derivedAge } : {}) } as never,
  });
  return getDriverById(driver.id, client);
}

export async function updateDriver(id: string, input: Record<string, unknown>, context: DriverSaveContext = {}) {
  await prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${id} FOR UPDATE`;
  const existing = await tx.driver.findUnique({ where: { id }, include: { documents: true } });
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
  const { stepCompleted, subStepCompleted, completeStep, age: _clientAge, registrationFeeEntryChoice, driverStatusChangeReason, ...data } = input as Record<string, unknown> & {
    stepCompleted?: number;
    subStepCompleted?: number;
    completeStep?: boolean;
    age?: unknown;
  };
  await validateBusinessStatus(input, existing as unknown as Record<string, unknown>, context);
  if (registrationFeeEntryChoice === 'Unpaid') {
    const movements = await tx.moneyMovement.findMany({where:{driverId:id,kind:{in:['registration_payment','registration_refund']}}});
    const received = (movements ?? []).reduce((sum,m)=>sum+(m.kind==='registration_payment'?m.amountPaise:-m.amountPaise),0);
    if (received > 0) throw new HttpError(409,'FEE_CORRECTION_REQUIRED','A collected registration fee cannot be changed to Unpaid here. Use the authorized, audited Accounts refund/correction flow. Existing receipts and history are preserved.');
    for (const key of FEE_FIELDS) delete data[key];
  }
  await validateDriverPreferences(data,existing as unknown as Record<string,unknown>);
  const onboarding =
    stepCompleted != null && completeStep !== false
      ? deriveOnboardingFields([...(existing.completedSubSteps ?? []), ...resolveNewlyCompletedKeys(stepCompleted, subStepCompleted)])
      : {};
  // Only recompute `age` when this save actually touches `dob` — an unrelated field edit
  // must never clobber a previously-derived age.
  const derivedAge = data.dob ? deriveAge(data.dob as string) : undefined;
  if (stepCompleted != null) delete data.status;
  const { pillItems, kycApprovalReadiness } = await import('./driver-pill.service');
  const submission = { ...existing, ...data, ...onboarding };
  const items = pillItems(submission as unknown as Parameters<typeof pillItems>[0]).flatMap(p => p.items).filter(i => i.checkable);
  // Carried, unchanged Verified status is not an approval transition. Ordinary
  // saves still invalidate approval when any related reviewed value changes.
  if (data.status === 'Verified' && (existing.status !== 'Verified' || context.explicitApproval)) {
    const checks = await tx.driverKycCheck.findMany({ where: { driverId: id } });
    const readiness=kycApprovalReadiness(submission as unknown as Parameters<typeof pillItems>[0],checks);
    if(!readiness.ready)throw new HttpError(422,'KYC_REVIEW_REQUIRED',readiness.reasons.join('; '),readiness);

  } else if (existing.status === 'Verified') {
    const previous = pillItems(existing as unknown as Parameters<typeof pillItems>[0]).flatMap(p => p.items).filter(i => i.checkable);
    if (items.some(item => previous.find(i => i.key === item.key)?.hash !== item.hash)) data.status = 'Non-Verified';
  }
  await tx.driver.update({
    where: { id },
    data: { ...data, ...onboarding, ...(derivedAge !== undefined ? { age: derivedAge } : {}) } as never,
  });
  if (data.driverStatusMasterId !== undefined && data.driverStatusMasterId !== existing.driverStatusMasterId) await tx.auditLog.create({data:{actorUserId:context.actorId!,action:'driver.master_status_change',targetType:'Driver',targetId:id,before:{driverStatusMasterId:existing.driverStatusMasterId},after:{driverStatusMasterId:data.driverStatusMasterId === null ? null : String(data.driverStatusMasterId),reason:String(driverStatusChangeReason ?? '')}}});
  });
  return getDriverById(id);
}

export async function deleteDriver(id: string) {
  await getDriverById(id);
  await prisma.driver.delete({ where: { id } });
}

export interface AddDriverDocumentInput {
  driverId: string;
  category: string;
  type: string;
  regNo?: string;
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  expiresAt?: string;
}

export async function addDriverDocument(input: AddDriverDocumentInput) {
  await getDriverById(input.driverId);
  const profilePhoto = input.category === 'personal' && input.type === 'Profile Photo';
  if (profilePhoto && (!input.filePath?.startsWith(`drivers/${input.driverId}/`) || input.filePath.split('/').length!==3 || input.filePath.includes('..') || !['image/png','image/jpeg','image/webp'].includes(input.mimeType ?? ''))) {
    throw new HttpError(422, 'PROFILE_PHOTO_INVALID', 'Upload a PNG, JPEG or WebP profile photo');
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${input.driverId} FOR UPDATE`;
    const previous = await tx.driverDocument.findFirst({ where: { driverId: input.driverId, category: input.category, type: input.type }, orderBy: { version: 'desc' } });
    await tx.driverDocument.updateMany({ where: { driverId: input.driverId, category: input.category, type: input.type, archivedAt: null }, data: { archivedAt: new Date() } });
    const document = await tx.driverDocument.create({ data: { ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined, version: (previous?.version ?? 0) + 1 } });
    if(input.type !== 'Registration Fee Receipt') await tx.driver.update({ where: { id: input.driverId }, data: { status: 'Non-Verified', ...(profilePhoto ? { avatar: document.filePath } : {}) } });
    return document;
  });
}

export async function listDriverDocuments(driverId: string) {
  await getDriverById(driverId);
  return prisma.driverDocument.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' } });
}

export async function deleteDriverDocument(driverId: string, docId: string) {
  const doc = await prisma.driverDocument.findFirst({ where: { id: docId, driverId } });
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Document not found');
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${driverId} FOR UPDATE`;
    await tx.driverDocument.update({ where: { id: docId }, data: { archivedAt: new Date() } });
    if(doc.type !== 'Registration Fee Receipt') await tx.driver.update({ where: { id: driverId }, data: { status: 'Non-Verified' } });
  });
  return doc;
}

/**
 * Links a Driver record to a User account, granting that user access to the self-service
 * driver portal (ownership-based — see `resolveOwnDriver`). Auto-assigns the `driver` role
 * if the user doesn't already hold it, so an admin does one action instead of two.
 * `Driver.userId` is `@unique` at the DB level — a second link attempt on an
 * already-linked user fails that constraint, translated to a clean 409 by the shared
 * error handler (same P2002 -> CONFLICT translation added in the Master Data phase).
 */
export async function linkDriverToUser(driverId: string, userId: string) {
  await getDriverById(driverId);

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  const driverRole = await prisma.role.findUnique({ where: { key: 'driver' } });
  if (driverRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: driverRole.id } },
      create: { userId, roleId: driverRole.id },
      update: {},
    });
  }

  await prisma.driver.update({ where: { id: driverId }, data: { userId } });
  return getDriverById(driverId);
}

/**
 * Toggles the Driver portal login gate (`accountStatus`) — independent of `status` (KYC
 * verification), which only ever changes via `PATCH /drivers/:id`. Enforced at login
 * (`assertDriverAccountActive`) and on every `/drivers/me*` call (`resolveOwnDriver`), not
 * just a frontend button hide.
 */
export async function setDriverAccountStatus(id: string, accountStatus: 'Active' | 'Inactive' | 'Suspended') {
  await getDriverById(id);
  await prisma.driver.update({ where: { id }, data: { accountStatus } });
  return getDriverById(id);
}

/**
 * Login-time guard shared by every sign-in route (OTP, password, Google). No-op for a User
 * with no linked Driver record at all — this only ever restricts a deactivated Driver's own
 * portal access, never a generic account check.
 */
export async function assertDriverAccountActive(userId: string): Promise<void> {
  const driver = await prisma.driver.findUnique({ where: { userId }, select: { accountStatus: true } });
  if (driver && ['Inactive','Suspended'].includes(driver.accountStatus)) {
    throw new HttpError(403, 'DRIVER_DEACTIVATED', 'Your driver account has been deactivated. Please contact your administrator.');
  }
}

/** Unlinks a Driver from its User (does not remove the `driver` role — a deliberate
 *  separate decision left to Role Management if an admin also wants that revoked). */
export async function unlinkDriverFromUser(driverId: string) {
  await getDriverById(driverId);
  await prisma.driver.update({ where: { id: driverId }, data: { userId: null } });
  return getDriverById(driverId);
}

/**
 * The ONLY way a Driver gets a portal login: one action creates the User, assigns the
 * `driver` role, and links it — all in one transaction, so a partial failure never leaves
 * an orphaned User or a half-linked Driver. This is the sole entry point into the Driver
 * User lifecycle; admins never pick an existing User for a driver (that path stays reserved
 * for the generic `linkDriverToUser` used elsewhere, but the Driver List UI only calls this).
 * `Driver.userId @unique` also backstops this at the DB level if called twice concurrently.
 */
export async function createAndLinkDriverUser(driverId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Driver" WHERE id=${driverId} FOR UPDATE`;
    const driver = await getDriverById(driverId, tx);
    if(driver.userId) throw new HttpError(409, 'ALREADY_LINKED', 'This driver already has a linked user account');
    if(!driver.phone && !driver.email) throw new HttpError(422, 'MISSING_CONTACT', 'Driver needs a phone or email on file before a user account can be created');
    const role = await tx.role.findUnique({where: {key: 'driver'}});
    if(!role || role.isActive === false) throw new HttpError(503, 'ROLE_MISSING', 'The existing driver role is unavailable');
    const phone = driver.phone ? normalizeIdentifier(driver.phone) : undefined;
    const email = driver.email ? normalizeIdentifier(driver.email) : undefined;
    const contacts = [...(phone ? [{phone}, ...(phone.startsWith('+91') ? [{phone:phone.slice(3)}] : [])] : []), ...(email ? [{email}] : [])];
    if (phone?.startsWith('+91')) {
      const conflicts = await tx.$queryRaw<{id:string}[]>`SELECT id FROM "User" WHERE regexp_replace(COALESCE(phone,''),'[^0-9]','','g') IN (${phone.slice(3)},${phone.slice(1)}) LIMIT 1`;
      if (conflicts?.length) throw new HttpError(409, 'CONTACT_CONFLICT', 'A login account already uses this contact. Authorized staff must resolve the conflict; no existing account has been reused.');
    }
    if(await tx.user.findFirst({where:{OR:contacts},select:{id:true}})) throw new HttpError(409, 'CONTACT_CONFLICT', 'A login account already uses this contact. Authorized staff must resolve the conflict; no existing account has been reused.');
    const user = await tx.user.create({data:{name:[driver.firstName,driver.lastName].filter(Boolean).join(' ').trim(),phone,email}});
    await tx.userRole.create({data:{userId:user.id,roleId:role.id}});
    await tx.driver.update({where:{id:driverId},data:{userId:user.id}});
  });
  return getDriverById(driverId);
}

// ---------------------------------------------------------------------------
// KYC verifier assignment + per-category checklist
// ---------------------------------------------------------------------------

/**
 * Assigns (or clears, if `verifierId` is null) the staff User responsible for this driver's
 * KYC review. Ownership-scoped `GET /drivers/assigned-to-me*` and `PATCH /drivers/:id/kyc-
 * checklist` are keyed off this field — see those routes and `getAssignedDriverById` below.
 */
export async function assignVerifier(driverId: string, verifierId: string | null) {
  await getDriverById(driverId);
  if (verifierId) {
    const verifier = await prisma.user.findFirst({ where: { id: verifierId, deletedAt: null,status:'active' },include:{roles:{include:{role:true}}} });
    if (!verifier) throw new HttpError(404, 'NOT_FOUND', 'Verifier user not found');
    const permissions=await import('./permission.service').then(m=>m.resolveEffectivePermissionsForUser(verifierId,verifier.roles.map(link=>link.role.key)));
    if(!permissions.includes('kyc-assignments:view'))throw new HttpError(422,'VERIFIER_PERMISSION_REQUIRED','Choose an active staff user with KYC review permission');
  }
  await prisma.driver.update({ where: { id: driverId }, data: { assignedVerifierId: verifierId } });
  return getDriverById(driverId);
}

/** The KYC queue for a given verifier — every Driver currently assigned to them. */
export async function listDriversAssignedTo(verifierUserId: string, query: {page?:number;pageSize?:number;search?:string;state?:string;sort?:string;direction?:'asc'|'desc'}={}, fullQueue=false) {
  const page=query.page??1,pageSize=Math.min(query.pageSize??25,100);
  const scope=fullQueue?{}:{assignedVerifierId:verifierUserId};
  const sort=['firstName','lastName','phone','driverType','status','createdAt'].includes(query.sort??'')?query.sort!:'createdAt';
  const search=query.search?{OR:[{id:{contains:query.search,mode:'insensitive' as const}},{firstName:{contains:query.search,mode:'insensitive' as const}},{phone:{contains:query.search}}]}:{};
  const states={Unassigned:{assignedVerifierId:null,status:{not:'Verified'},kycChecks:{none:{status:'Issue'}}},Assigned:{assignedVerifierId:{not:null},status:{not:'Verified'},kycChecks:{none:{status:'Issue'}}},'Issues Raised':{status:{not:'Verified'},kycChecks:{some:{status:'Issue'}}},Completed:{status:'Verified'}};
  const where={AND:[scope,search,states[query.state as keyof typeof states]??{}]};
  const [rows,total,counts]=await Promise.all([prisma.driver.findMany({where,orderBy:[{[sort]:query.direction??'desc'},{id:'asc'}],take:pageSize,skip:(page-1)*pageSize,include:{documents:true,kycChecks:{select:{status:true}},assignedVerifier:{select:{id:true,name:true}},user:{select:LINKED_USER_SELECT}}}),prisma.driver.count({where}),Promise.all(Object.entries(states).map(async([state,predicate])=>[state,await prisma.driver.count({where:{AND:[scope,search,predicate]}})]))]);
  return {rows:rows.map(row=>({...row,queueState:row.status==='Verified'?'Completed':row.kycChecks?.some(check=>check.status==='Issue')?'Issues Raised':row.assignedVerifierId?'Assigned':'Unassigned'})),meta:{total,page,pageSize,counts:Object.fromEntries(counts)}};
}

/**
 * The ownership-checked single-driver fetch for a verifier's own queue — mirrors
 * `resolveOwnDriver`'s posture exactly: 404s whether the driver doesn't exist or simply isn't
 * assigned to this verifier, so the response never confirms which case it is.
 */
export async function getAssignedDriverById(id: string, verifierUserId: string) {
  const driver = await prisma.driver.findFirst({
    where: { id, assignedVerifierId: verifierUserId },
    include: { documents: true, user: { select: LINKED_USER_SELECT } },
  });
  if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
  return driver;
}

const KYC_CHECKLIST_FIELDS = {
  personal: { status: 'personalDocsStatus', notes: 'personalDocsNotes' },
  health: { status: 'healthDocsStatus', notes: 'healthDocsNotes' },
  education: { status: 'educationDocsStatus', notes: 'educationDocsNotes' },
  police: { status: 'policeDocsStatus', notes: 'policeDocsNotes' },
} as const;

export type KycChecklistCategory = keyof typeof KYC_CHECKLIST_FIELDS;

/**
 * Sets one of the 4 KYC checklist categories for a driver — ownership-checked (only the
 * assigned verifier may call this), same posture as `getAssignedDriverById`. Independent of
 * the final `status` verdict, which stays gated by `drivers:edit` only (see `PATCH /:id`).
 */
export async function setKycChecklistItem(
  driverId: string,
  verifierUserId: string,
  category: KycChecklistCategory,
  status: 'Verified' | 'Rejected' | 'Correction Requested',
  notes: string | undefined,
) {
  await getAssignedDriverById(driverId, verifierUserId); // throws 404 if not assigned to this verifier
  const fields = KYC_CHECKLIST_FIELDS[category];
  await prisma.driver.update({
    where: { id: driverId },
    data: { [fields.status]: status, [fields.notes]: notes ?? null },
  });
  return getAssignedDriverById(driverId, verifierUserId);
}

// ---------------------------------------------------------------------------
// Customer-facing booking prerequisite — a safe, minimal driver projection for the "choose a
// driver" step. Deliberately excludes every KYC/contact/financial field (email, phone, bank
// details, documents) that the admin-facing `listDrivers()`/`getDriverById()` expose.
// ---------------------------------------------------------------------------

const CUSTOMER_SAFE_DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  vehicle: true,
  driverType: true,
} as const;

export async function listAvailableDrivers() {
  return prisma.driver.findMany({
    where: { status: 'Verified', accountStatus: 'Active' },
    select: CUSTOMER_SAFE_DRIVER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
