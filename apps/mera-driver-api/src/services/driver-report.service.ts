import { getDriverById } from './driver.service';
import { prisma } from '../lib/prisma';
import { DRIVER_PILLS } from './driver-pill.service';
import { feeState } from './trip-workflow.service';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_ROOT } from '../lib/upload';
import { dlReviewState } from './driver-dl.service';

function escape(value: unknown): string {
  const text = value == null || value === '' ? 'Not provided' : value instanceof Date ? value.toISOString()
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function label(key: string) { return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }
function reportValue(key:string,value:unknown){
  if(key==='avatar'&&typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(value))return `Embedded photo (${value.slice(5,value.indexOf(';'))}, ${Buffer.from(value.slice(value.indexOf(',')+1),'base64').length} bytes)`;
  return value;
}

/** Current backend snapshot for authorized server PDF rendering. Every stored scalar is
 * included, including legacy fields outside current pills. Relations are explicit. */
export async function driverReportHtml(id: string, now = new Date()) {
  const driver = await getDriverById(id);
  const [checks, decisions, trips, movements, intents] = await Promise.all([
    prisma.driverKycCheck.findMany({ where: { driverId: id } }),
    prisma.driverKycDecision.findMany({ where: { driverId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.booking.findMany({ where: { driverId: id }, orderBy: { createdAt: 'desc' } }),
    prisma.moneyMovement.findMany({ where: { OR:[{driverId:id},{booking:{driverId:id}}] }, orderBy: { createdAt: 'desc' } }),
    prisma.paymentIntent.findMany({where:{driverId:id}}),
  ]);
  let fee=feeState(driver,movements??[]);
  const dl=await dlReviewState(id,driver);
  if(fee==='Unpaid')fee=(intents??[]).some(i=>['pending','processing'].includes(i.status))?'Pending':(intents??[]).some(i=>i.status==='failed')?'Failed':'Unpaid';
  let photo = '';
  if (driver.avatar?.startsWith('data:image/') && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(driver.avatar)) photo = driver.avatar;
  else if (driver.avatar?.startsWith('drivers/')) {
    const resolved = path.resolve(UPLOAD_ROOT, driver.avatar);
    if (resolved.startsWith(path.resolve(UPLOAD_ROOT) + path.sep) && /\.(png|jpe?g|webp)$/i.test(resolved)) {
      try { const bytes = await readFile(resolved); if (bytes.length <= 10 * 1024 * 1024) photo = `data:image/${/\.png$/i.test(resolved) ? 'png' : /\.webp$/i.test(resolved) ? 'webp' : 'jpeg'};base64,${bytes.toString('base64')}`; } catch { /* Explicit unavailable photo below. */ }
    }
  }
  const record = driver as unknown as Record<string, unknown>;
  const printed = new Set<string>();
  const rows = (keys: string[]) => keys.map(key => { printed.add(key); return `<tr><th>${escape(label(key))}</th><td>${escape(reportValue(key,record[key]))}</td></tr>`; }).join('');
  const sections = DRIVER_PILLS.map(p => `<section><h2>${escape(p.tabLabel)} → ${escape(p.label)}</h2><p>${driver.completedSubSteps.includes(p.tab * 10 + p.pill) ? 'Completed' : 'Incomplete'}</p><table>${rows(p.fields)}</table></section>`).join('');
  const relations = new Set(['documents', 'user', 'assignedVerifier']);
  const other = Object.keys(record).filter(key => !printed.has(key) && !relations.has(key));
  const documents = driver.documents.map(d => `<tr><td>${escape(d.category)} / ${escape(d.type)}<br>Version ${d.version ?? 1} · ${d.archivedAt ? 'Archived' : 'Current'}</td><td>${escape(d.fileName)}<br>${escape(d.regNo)}</td><td>${escape(d.createdAt)}<br>Expiry: ${escape(d.expiresAt)}<br>${escape(d.mimeType)} · ${escape(d.sizeBytes)} bytes</td><td>${escape(checks.find(c => c.itemKey === `document:${d.id}`)?.status ?? 'Pending')}<br>${escape(checks.find(c => c.itemKey === `document:${d.id}`)?.reason)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Driver ${escape(driver.id)}</title><style>
    body{font:13px Arial,sans-serif;color:#172033;max-width:900px;margin:24px auto}h1{color:#116864}h2{font-size:17px;margin-top:24px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:7px;text-align:left;vertical-align:top;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{width:34%}tr{break-inside:avoid}p{break-inside:avoid;overflow-wrap:anywhere}.decision{padding:8px;border:1px solid #ddd;margin:8px 0;break-inside:avoid;page-break-inside:avoid;overflow-wrap:anywhere}section{break-inside:auto}h2{break-after:avoid}@media print{body{margin:0}.inventory,.kyc-history{break-before:page}a{color:inherit}}
    </style></head><body><h1>Mera Driver · Complete Driver Profile</h1><p>${escape([driver.firstName,driver.lastName].filter(Boolean).join(' '))} · ${escape(driver.id)}</p>
    <p>Generated: ${escape(now)} · Onboarding ${driver.completionPercentage}% · Account ${escape(driver.accountStatus)} · KYC ${escape(driver.status)}</p>
    ${photo ? `<p>Saved driver photo embedded.</p><img alt="Driver photo" src="${photo}" style="width:100px;max-height:140px;object-fit:contain">` : '<p>Photo is missing or unavailable for embedding. Saved photo reference appears in profile fields.</p>'}
    ${sections}<section><h2>Additional saved fields &amp; progress</h2><table>${rows(other)}</table></section>
    <section class="inventory"><h2>Complete document inventory</h2><p>Originals, including archived versions, are available separately through authenticated document previews. Documents are not embedded in this report.</p><table><tr><th>Category / type / version</th><th>File / registration</th><th>Uploaded / expiry / file metadata</th><th>KYC check / issue</th></tr>${documents || '<tr><td colspan="4">No documents uploaded</td></tr>'}</table></section>
    <section class="kyc-history"><h2>KYC decision history</h2>${decisions.map(d => `<div class="decision">${escape(d.createdAt)} · ${escape(d.itemKey)} · ${escape(d.status)} · Reviewer ${escape(d.reviewerId)}<br>${d.reason?escape(d.reason):'No issue recorded'}<br>Submitted value: ${escape(reportValue(d.itemKey.replace('field:',''),d.submittedValue))}</div>`).join('') || '<p>No recorded decisions</p>'}</section>
    <section><h2>Licence verification</h2><p>Human pill review and final KYC approval are separate. IDSPay checks are explicitly performed by authorized assigned reviewers; historical consent records are retained but are not required.</p><p>API status: ${escape(dl.status)} · </p>${dl.history.map(entry=>`<p>${escape(entry.createdAt)} · Initiator ${escape(entry.initiatorId)} · ${escape(entry.action)}<br>${escape(entry.summary)}</p>`).join('')}</section>
    <section><h2>Registration fee</h2><p>Status: ${fee} · Configured amount: ${escape(driver.registrationFeePaise)} paise · ${driver.registrationFeeRequired ? 'Required' : 'Optional'}</p><h3>Financial history</h3>${(movements ?? []).map(m=>`<p>${escape(m.createdAt)} · ${escape(m.kind)} · ${m.amountPaise} paise · ${escape(m.reference)} · ${escape(m.reason)}</p>`).join('') || '<p>No recorded financial movements</p>'}</section>
    <section><h2>Trips &amp; earnings</h2>${(trips ?? []).map(t=>`<p>${escape(t.bookingCode)} · ${escape(t.scheduledAt)} · ${escape(t.status)}<br>${escape(t.pickupAddress)} → ${escape(t.dropAddress)}<br>Fare ${escape(t.farePaise)} paise · Commission ${escape(t.commissionPaise)} paise · Driver share ${escape(t.driverSharePaise)} paise · Payment ${escape(t.paymentStatus)}</p>`).join('') || '<p>No assigned trips</p>'}</section>
    </body></html>`;
}
