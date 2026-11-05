import { driverProfilePhoto } from './driver-photo.service';
import { getDriverById } from './driver.service';
import { getPillReview, DRIVER_PILLS, driverFieldLabel } from './driver-pill.service';
import { driverEligibility } from './trip-workflow.service';
import { currentLicence } from './licence-policy.service';

const label=driverFieldLabel;
export async function driverDetails(id: string) {
  const driver = await getDriverById(id);
  const [review, eligibility] = await Promise.all([getPillReview(id), driverEligibility(id)]);
  const record = driver as unknown as Record<string, unknown>;
  const used = new Set<string>();
  const fields = (keys: string[]) => keys.map(key => {
    used.add(key);
    const value = record[key];
    // File references are represented by authenticated previews, never printed paths.
    return { key, label: label(key), value: key === 'avatar' || typeof value === 'string' && (/^(drivers\/|[A-Za-z]:[\\/])/.test(value) || /Upload/.test(key)) ? (value ? 'Saved file (see documents)' : null) : value ?? null };
  });
  const documents = (review.documentInventory ?? []).map(doc => ({
    id: doc.id, category: doc.category, type: doc.type, fileName: doc.fileName, regNo: doc.regNo, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes,
    version: doc.version, createdAt: doc.createdAt, expiresAt: doc.expiresAt, archivedAt: doc.archivedAt,
    review: doc.review ? { status: doc.review.status, reason: doc.review.reason } : null,
    preview: doc.filePath && /^drivers\/[^/]+\/[^/]+$/.test(doc.filePath) && !doc.filePath.includes('..') ? `/uploads/${doc.filePath.split('/').map(encodeURIComponent).join('/')}` : null,
  }));
  const sections = DRIVER_PILLS.map(pill => ({ title: `${pill.tabLabel} · ${pill.label}`, completed: driver.completedSubSteps.includes(pill.tab * 10 + pill.pill), fields: fields(pill.fields), documents: documents.filter(doc => {
    if (doc.category === 'personal' && /driving licen[cs]e/i.test(doc.type)) return pill.tab === 3 && pill.pill === 0;
    return doc.category === pill.category;
  }) }));
  sections.push({title:'Additional saved fields & progress',completed:false,fields:fields(Object.keys(record).filter(key=>!used.has(key)&&!['documents','user','assignedVerifier','driverStatusMaster'].includes(key))),documents:documents.filter(doc=>!['personal','education','health','police'].includes(doc.category))});
  const photo=await driverProfilePhoto(driver);
  const currentPill = DRIVER_PILLS.find(pill=>pill.tab===driver.currentStep&&pill.pill===driver.currentSubStep);
  return { id, name: [driver.firstName, driver.lastName].filter(Boolean).join(' '), photo,
    city:driver.city,state:driver.state,phone:driver.phone,email:driver.email,availability:driver.online?'Online':'Offline',driverType:driver.driverType,experience:driver.experience,source:driver.sourceType,
    onboarding:{status:driver.onboardingStatus,percentage:Math.round(100*DRIVER_PILLS.filter(p=>driver.completedSubSteps.includes(p.tab*10+p.pill)).length/DRIVER_PILLS.length),completed:DRIVER_PILLS.filter(p=>driver.completedSubSteps.includes(p.tab*10+p.pill)).length,total:DRIVER_PILLS.length,tab:currentPill?.tabLabel??'Personal Details',pill:currentPill?.label??'Personal & Identity Details'},
    account: driver.accountStatus, kyc: driver.status, dl: review.dl, licenceValidity: !driver.dlExpiryDate ? 'Not provided' : currentLicence(driver.dlExpiryDate) ? 'Valid expiry date (human KYC approval remains separate)' : 'Expired or invalid expiry date', fee: eligibility.fee, feeRequired:driver.registrationFeeRequired,
    review:{checked:review.checked,total:review.total,issues:review.issues,status:review.status,profile:review.profile,history:review.history.map(h=>({id:h.id,itemKey:h.itemKey,label:h.label,status:h.status,reason:h.reason,reviewerName:h.reviewerName,createdAt:h.createdAt}))}, approval:review.approval, reasons: eligibility.reasons, sections };
}
