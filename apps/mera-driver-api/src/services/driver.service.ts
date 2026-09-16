import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';

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
      user: { select: LINKED_USER_SELECT },
      assignedVerifier: { select: LINKED_USER_SELECT },
    },
  });
}

export async function getDriverById(id: string) {
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: {
      documents: true,
      user: { select: LINKED_USER_SELECT },
      assignedVerifier: { select: LINKED_USER_SELECT },
    },
  });
  if (!driver) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
  return driver;
}

/**
 * `stepCompleted`/`subStepCompleted` are stripped off before hitting Prisma — neither is a
 * Driver column, they're the signal that drives `deriveOnboardingFields`. Omitting both (the
 * driver's own `PATCH /drivers/me`) leaves onboarding progress untouched on update, so this
 * never regresses a driver's progress when someone edits them outside the step wizard. On
 * create, no step info at all means a plain one-shot add with a fully-filled form, so it's
 * treated as fully onboarded (there's no wizard session to resume).
 */
export async function createDriver(input: Record<string, unknown>) {
  const { stepCompleted, subStepCompleted, age: _clientAge, ...data } = input as Record<string, unknown> & {
    stepCompleted?: number;
    subStepCompleted?: number;
    age?: unknown;
  };
  const onboarding = deriveOnboardingFields(resolveNewlyCompletedKeys(stepCompleted, subStepCompleted));
  const derivedAge = deriveAge(data.dob as string | undefined);
  const driver = await prisma.driver.create({
    data: { ...data, ...onboarding, ...(derivedAge !== undefined ? { age: derivedAge } : {}) } as never,
  });
  return getDriverById(driver.id);
}

export async function updateDriver(id: string, input: Record<string, unknown>) {
  const existing = await getDriverById(id);
  const { stepCompleted, subStepCompleted, age: _clientAge, ...data } = input as Record<string, unknown> & {
    stepCompleted?: number;
    subStepCompleted?: number;
    age?: unknown;
  };
  const onboarding =
    stepCompleted != null
      ? deriveOnboardingFields([...(existing.completedSubSteps ?? []), ...resolveNewlyCompletedKeys(stepCompleted, subStepCompleted)])
      : {};
  // Only recompute `age` when this save actually touches `dob` — an unrelated field edit
  // must never clobber a previously-derived age.
  const derivedAge = data.dob ? deriveAge(data.dob as string) : undefined;
  await prisma.driver.update({
    where: { id },
    data: { ...data, ...onboarding, ...(derivedAge !== undefined ? { age: derivedAge } : {}) } as never,
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
}

export async function addDriverDocument(input: AddDriverDocumentInput) {
  await getDriverById(input.driverId);
  return prisma.driverDocument.create({ data: input });
}

export async function listDriverDocuments(driverId: string) {
  await getDriverById(driverId);
  return prisma.driverDocument.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' } });
}

export async function deleteDriverDocument(driverId: string, docId: string) {
  const doc = await prisma.driverDocument.findFirst({ where: { id: docId, driverId } });
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Document not found');
  await prisma.driverDocument.delete({ where: { id: docId } });
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
export async function setDriverAccountStatus(id: string, accountStatus: 'Active' | 'Inactive') {
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
  if (driver?.accountStatus === 'Inactive') {
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
  const driver = await getDriverById(driverId);
  if (driver.userId) {
    throw new HttpError(409, 'ALREADY_LINKED', 'This driver already has a linked user account');
  }
  if (!driver.phone && !driver.email) {
    throw new HttpError(422, 'MISSING_CONTACT', 'Driver needs a phone or email on file before a user account can be created');
  }

  const driverRole = await prisma.role.findUnique({ where: { key: 'driver' } });
  if (!driverRole) {
    throw new HttpError(500, 'ROLE_MISSING', 'The driver role is not seeded in this environment');
  }

  const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ').trim() || 'Driver';

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email: driver.email ?? undefined, phone: driver.phone ?? undefined },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: driverRole.id } });
    await tx.driver.update({ where: { id: driverId }, data: { userId: user.id } });
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
    const verifier = await prisma.user.findFirst({ where: { id: verifierId, deletedAt: null } });
    if (!verifier) throw new HttpError(404, 'NOT_FOUND', 'Verifier user not found');
  }
  await prisma.driver.update({ where: { id: driverId }, data: { assignedVerifierId: verifierId } });
  return getDriverById(driverId);
}

/** The KYC queue for a given verifier — every Driver currently assigned to them. */
export async function listDriversAssignedTo(verifierUserId: string) {
  return prisma.driver.findMany({
    where: { assignedVerifierId: verifierUserId },
    orderBy: { createdAt: 'desc' },
    include: { documents: true, user: { select: LINKED_USER_SELECT } },
  });
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
