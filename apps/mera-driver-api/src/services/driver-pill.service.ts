import { driverProfilePhoto } from './driver-photo.service';
import { currentLicence } from './licence-policy.service';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import { getDriverById, getAssignedDriverById } from './driver.service';
import { dlReviewState } from './driver-dl.service';

/** Exact hierarchy inspected in drivers.html. Staff decisions/fees are read-only
 * context, never checkable payment confirmations. */
export const DRIVER_PILLS = [
  { tab: 1, pill: 0, tabLabel: 'Personal Details', label: 'Personal & Identity Details', fields: ['firstName', 'lastName', 'fatherName', 'motherName', 'dob', 'gender', 'maritalStatus', 'language', 'languages'] },
  { tab: 1, pill: 1, tabLabel: 'Personal Details', label: 'Contact & Address Info', fields: ['email', 'phone', 'emergencyNumber', 'pincode', 'state', 'city', 'address'] },
  { tab: 1, pill: 2, tabLabel: 'Personal Details', label: 'Physical & Demographics', fields: ['height', 'weight', 'religion', 'color'] },
  { tab: 1, pill: 3, tabLabel: 'Personal Details', label: 'Account & Lead Info', fields: ['sourceType', 'jobType', 'jobChoices', 'workLocation', 'workStates', 'experience', 'driverType', 'avatar'] },
  { tab: 2, pill: 0, tabLabel: 'Education & Health Details', label: 'Education & Training Profile', fields: ['education', 'trainingStatus', 'trainingCertificate'], category: 'education' },
  { tab: 2, pill: 1, tabLabel: 'Education & Health Details', label: 'Health & Medical Specifications', fields: ['eyeVision', 'bloodGroup', 'healthInsurance'], category: 'health' },
  { tab: 3, pill: 0, tabLabel: 'Documents Details', label: 'Driving License Details', fields: ['licenseDetails', 'vehicleType', 'dlNo', 'dlIssueDate', 'dlExpiryDate'] },
  { tab: 3, pill: 1, tabLabel: 'Documents Details', label: 'Police Verification & Employment', fields: ['policeVerifiedStatus', 'policeVerifiedNo', 'currentSalary', 'expectedSalary'], category: 'police' },
  { tab: 3, pill: 2, tabLabel: 'Documents Details', label: 'Personal & Category Docs', fields: [] as string[], category: 'personal' },
  { tab: 4, pill: 0, tabLabel: 'Payment Details', label: 'Account Details', fields: ['accountPaymentMethod', 'bankName', 'bankAccountNo', 'ifscCode', 'branchName', 'upiIdOrChequeNo'] },
  { tab: 4, pill: 1, tabLabel: 'Payment Details', label: 'Registration Fees', fields: ['preferredPaymentMode', 'amount', 'paymentReceiptDate','driverStatusName'], financeOnly: true },
];

/** Display labels extend the existing pill fields, not a separate checklist. */
export function driverFieldLabel(key:string){return ({dob:'Date of Birth',dlNo:'DL Number',dlIssueDate:'DL Issue Date',dlExpiryDate:'DL Expiry Date',avatar:'Profile Photo',ifscCode:'IFSC Code',upiIdOrChequeNo:'UPI ID / Cheque Number',bankAccountNo:'Bank Account Number'} as Record<string,string>)[key]??key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());}

export function valueHash(value: unknown) { return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex'); }

export function pillItems(driver: Record<string, Prisma.InputJsonValue | null> & { documents: { id: string; category: string; type: string; filePath: string | null; fileName: string | null; regNo: string | null }[] }) {
  return DRIVER_PILLS.map(pill => ({ ...pill, items: [
    ...pill.fields.map(field => ({ key: `field:${field}`, field, label:driverFieldLabel(field), value: driver[field] ?? null, hash: valueHash(driver[field]), checkable: !pill.financeOnly })),
    ...driver.documents.filter(doc => doc.category === pill.category && !(doc as { archivedAt?: unknown }).archivedAt).map(doc => {
      const value = { id: doc.id, type: doc.type, fileName: doc.fileName, regNo: doc.regNo, filePath: doc.filePath };
      return { key: `document:${doc.id}`, field: doc.type, label:doc.type, value, hash: valueHash(value), checkable: doc.type !== 'Registration Fee Receipt' };
    }),
  ] }));
}

/** One policy shared by read-only readiness and the locked approval transition.
 * Finance-only registration fees, availability and unconfirmed DL API are excluded. */
export function kycApprovalReadiness(driver:Parameters<typeof pillItems>[0], checks:{itemKey:string;status:string;valueHash:string;reason?:string|null}[]){
  const completed=(driver.completedSubSteps??[]) as unknown as number[];
  const pills=pillItems(driver);
  const reasons:string[]=[];
  for(const pill of pills.filter(p=>!p.financeOnly))if(!completed.includes(pill.tab*10+pill.pill))reasons.push(`${pill.tabLabel} / ${pill.label}: onboarding form incomplete`);
  if(!driver.dlNo)reasons.push('Driving licence number is missing');
  if(!driver.dlExpiryDate||!currentLicence(String(driver.dlExpiryDate)))reasons.push('Driving licence expiry is missing, malformed or expired');
  const checklist=pills.flatMap(p=>p.items.filter(i=>i.checkable).map(item=>{
    const check=checks.find(c=>c.itemKey===item.key);
    const status=!check?'Pending':check.valueHash!==item.hash?'Review required after changes':check.status==='Pass'?'Passed':check.status==='Issue'?'Issue':'Pending';
    if(status!=='Passed')reasons.push(`${p.tabLabel} / ${p.label} / ${item.label}: ${status}`);
    return {key:item.key,field:item.field,label:item.label,tab:p.tab,pill:p.pill,tabLabel:p.tabLabel,pillLabel:p.label,status,reason:check?.valueHash===item.hash?check.reason??null:null};
  }));
  return {ready:reasons.length===0,reasons,checklist};
}

export async function getPillReview(driverId: string, reviewerId?: string) {
  const driver = reviewerId ? await getAssignedDriverById(driverId, reviewerId) : await getDriverById(driverId);
  const checks = await prisma.driverKycCheck.findMany({ where: { driverId } });
  const history = await prisma.driverKycDecision.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' } });
  const dl=await dlReviewState(driverId,driver);
  const reviewerIds=[...new Set([...dl.history.map(h=>h.initiatorId),driver.assignedVerifierId,...checks.map(c=>c.reviewerId),...(history??[]).map(h=>h.reviewerId)].filter((id):id is string=>typeof id==='string'))];
  const people=reviewerIds.length?(await prisma.user.findMany({where:{id:{in:reviewerIds}},select:{id:true,name:true}}))??[]:[];
  const reviewerName=(id:string|null|undefined)=>people.find(p=>p.id===id)?.name??'Reviewer unavailable';
  const profile={loginLinked:!!driver.userId,kycStatus:driver.status,name:[driver.firstName,driver.lastName].filter(Boolean).join(' '),photo:await driverProfilePhoto(driver),assignedReviewer:driver.assignedVerifierId?reviewerName(driver.assignedVerifierId):'Unassigned'};
  const pills = pillItems(driver as unknown as Parameters<typeof pillItems>[0]).map(pill => ({ ...pill,
    completed: driver.completedSubSteps.includes(pill.tab * 10 + pill.pill),
    items: pill.items.map(item => {
      const check = checks.find(check => check.itemKey === item.key);
      const current = check?.valueHash === item.hash;
      return { ...item, status: current ? check!.status : 'Pending', reason: current ? check?.reason : null, reviewerId: check?.reviewerId, reviewedAt: check?.reviewedAt, changedSinceReview: !!check && !current };
    }),
  }));
  const items = pills.flatMap(pill => pill.items).filter(item => item.checkable);
  const checked = items.filter(item => item.status !== 'Pending').length;
  const issues = items.filter(item => item.status === 'Issue').length;
  return { approval:kycApprovalReadiness(driver as unknown as Parameters<typeof pillItems>[0],checks), driverId, pills, checked, total: items.length, issues, profile, history: (history??[]).map(h=>({...h,label:h.itemKey.startsWith('document:')?(driver.documents.find(d=>d.id===h.itemKey.slice(9))?.type??'Document'):driverFieldLabel(h.itemKey.replace(/^field:/,'')),reviewerName:reviewerName(h.reviewerId)})), dl:{...dl,history:dl.history.map(h=>({...h,initiatorName:h.summary.actorType==='phone_verified_driver'?'Driver (phone OTP consent)':reviewerName(h.initiatorId)}))}, documentInventory: driver.documents.map(doc=>{const check=checks.find(c=>c.itemKey===`document:${doc.id}`);const item=pills.flatMap(p=>p.items).find(i=>i.key===`document:${doc.id}`);return {...doc,review:check?{...check,...(!doc.archivedAt&&item?.changedSinceReview?{status:'Review required after changes',reason:null}:{})}:null};}), status: issues ? 'Changes requested' : checked === items.length && items.length > 0 ? 'Awaiting final approval' : 'In review' };
}

export async function savePillCheck(driverId: string, reviewerId: string, input: { key: string; status: 'Pass' | 'Issue'; reason?: string; hash: string }) {
  const driver = await getAssignedDriverById(driverId, reviewerId);
  const item = pillItems(driver as unknown as Parameters<typeof pillItems>[0]).flatMap(pill => pill.items).find(item => item.key === input.key);
  if (!item?.checkable) throw new HttpError(422, 'KYC_ITEM_INVALID', 'This item cannot be checked by a KYC verifier');
  if (item.hash !== input.hash) throw new HttpError(409, 'KYC_SUBMISSION_CHANGED', 'The submitted value changed. Reload it before reviewing');
  if (input.status === 'Issue' && !input.reason?.trim()) throw new HttpError(422, 'KYC_REASON_REQUIRED', 'Describe exactly what the driver needs to correct');
  await prisma.$transaction(async tx => {
    // PostgreSQL row lock serializes checks with updates to the Driver row.
    await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${driverId} FOR UPDATE`;
    const current = await tx.driver.findFirst({ where: { id: driverId, assignedVerifierId: reviewerId }, include: { documents: true } });
    if (!current) throw new HttpError(404, 'NOT_FOUND', 'Driver not found');
    const freshItem = pillItems(current as unknown as Parameters<typeof pillItems>[0]).flatMap(pill => pill.items).find(value => value.key === input.key);
    if (freshItem?.hash !== input.hash) throw new HttpError(409, 'KYC_SUBMISSION_CHANGED', 'The submitted value changed. Reload it before reviewing');
    const data = { status: input.status, reason: input.status === 'Issue' ? input.reason!.trim() : null, valueHash: item.hash, reviewerId, reviewedAt: new Date() };
    await tx.driverKycCheck.upsert({ where: { driverId_itemKey: { driverId, itemKey: item.key } }, create: { driverId, itemKey: item.key, ...data }, update: data });
    await tx.driverKycDecision.create({ data: { driverId, itemKey: item.key, status: data.status, reason: data.reason, valueHash: item.hash, submittedValue: item.value ?? Prisma.JsonNull, reviewerId } });
    if (input.status === 'Issue') {
      await tx.driver.update({ where: { id: driverId }, data: { status: 'Non-Verified', verificationNotes: data.reason } });
      if (current.userId) await tx.portalMessage.create({ data: { userId: current.userId, kind: 'notification', subject: 'KYC changes requested', body: `${input.key}: ${data.reason}. Open KYC & Documents and choose Fix this pill.` } });
    }
  });
  return getPillReview(driverId, reviewerId);
}
