import { createHash } from 'node:crypto';
import { getDriverById } from './driver.service';
import { renderBackendPdf } from './driver-pdf.service';
import { prisma } from '../lib/prisma';
import { Prisma } from '../generated/prisma-client';
import { HttpError } from '../middleware/errorHandler';
import { ResumeProfileSchema, ResumeProfile, resumeDate } from '../schemas/driver-resume.schema';
import { currentLicence } from './licence-policy.service';

const text=(v:unknown):string=>typeof v==='string'?v.trim():'';
const list=(v:unknown):string[]=>[...new Set((Array.isArray(v)?v:text(v).split(',')).map(text).filter(Boolean))];
const escape=(v:unknown)=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function formatResumeDate(value:unknown):string{
  const raw=text(value);if(!resumeDate(raw))return '';
  return new Date(`${raw.length===7?raw+'-01':raw}T00:00:00Z`).toLocaleDateString('en-IN',{month:'short',year:'numeric',...(raw.length===10?{day:'numeric'}:{}),timeZone:'UTC'});
}
/** Deliberate professional-data projection. No spread of Driver/KYC/financial data. */
export function projectResume(record:Record<string,unknown>,now=new Date()){
  const parsed=ResumeProfileSchema.safeParse(record.resumeProfile??{});
  const profile=parsed.success?parsed.data:ResumeProfileSchema.parse({});
  const name=[text(record.firstName),text(record.lastName)].filter(Boolean).join(' ');
  const types=list(record.driverType),vehicles=list(record.vehicleType);
  const location=[text(record.city),text(record.state)].filter(Boolean).join(', ');
  const experienceDescription=text(record.experience);
  const summary=profile.summary||[
    types.length?`${types.join(', ')}${location?` based in ${location}`:''}.`:location?`Professional driver based in ${location}.`:'',
    experienceDescription?`Saved driving experience: ${experienceDescription}.`:'',
    vehicles.length?`Vehicle experience: ${vehicles.join(', ')}.`:'',
    profile.servicePreferences.length?`Service preferences: ${profile.servicePreferences.join(', ')}.`:'',
  ].filter(Boolean).join(' ');
  const workExperience=profile.workExperience.map(entry=>({...entry,period:entry.current?[formatResumeDate(entry.startDate),'Present'].filter(Boolean).join(' – '):[formatResumeDate(entry.startDate),formatResumeDate(entry.endDate)].filter(Boolean).join(' – ')}));
  const data={name:name||'Driver',title:types.join(' / ')||'Professional Driver',location,
    phone:profile.sharePhone?text(record.phone):'',email:profile.shareEmail?text(record.email):'',summary,experienceDescription,
    licence:{number:text(record.dlNo),classes:list(record.licenseDetails),issueDate:formatResumeDate(record.dlIssueDate),expiryDate:formatResumeDate(record.dlExpiryDate),
      validity:!text(record.dlExpiryDate)?'':!formatResumeDate(record.dlExpiryDate)?'Validity not confirmed':currentLicence(text(record.dlExpiryDate),now)?'Expiry date is current':'Expired',verification:'API verification not confirmed'},
    vehicleTypes:vehicles,transmissionSkills:profile.transmissionSkills,workExperience,
    keySkills:[...new Set([...types,...vehicles,...profile.transmissionSkills,...profile.keySkills])],
    education:{qualification:text(record.education),...profile.education},trainingStatus:text(record.trainingStatus),
    languages:[...new Set([...list(record.languages),...list(record.language)])],workingCity:text(record.city),availability:profile.availability,servicePreferences:profile.servicePreferences};
  const missing=[!data.summary&&'Professional summary',!data.licence.number&&'DL number',!data.licence.classes.length&&'Licence classes',!data.licence.expiryDate&&'Valid licence expiry',
    !workExperience.length&&'Employment records (employer, dates and responsibilities)',!data.transmissionSkills.length&&'Manual / automatic skills',!data.education.qualification&&'Education qualification',
    !data.education.institution&&'Education institution',!data.education.year&&'Education year',!data.languages.length&&'Languages',!data.availability&&'Work availability',!data.servicePreferences.length&&'Service preferences',!parsed.success&&'Valid resume-specific source data'].filter((v):v is string=>!!v);
  const revision=createHash('sha256').update(JSON.stringify({data,profile})).digest('hex');
  const filename=`${data.name.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,'_').slice(0,80)||'Driver'}_Driver_Resume.pdf`;
  return {data,profile,missing,revision,filename};
}
export function renderResumeHtml(data:ReturnType<typeof projectResume>['data'],demo=false){
  const line=(label:string,value:string)=>value?`<p><strong>${escape(label)}:</strong> ${escape(value)}</p>`:'';
  const bullets=(items:string[])=>`<ul>${items.map(item=>`<li>${escape(item)}</li>`).join('')}</ul>`;
  const section=(title:string,body:string)=>body?`<section><h2>${escape(title)}</h2>${body}</section>`:'';
  const dl=data.licence;
  const licence=[line('DL number',dl.number),line('Licence classes',dl.classes.join(', ')),line('Issued',dl.issueDate),line('Valid until',dl.expiryDate),line('Validity',dl.validity),dl.number?line('Verification',dl.verification):'',line('Vehicle types',data.vehicleTypes.join(', ')),line('Transmission skills',data.transmissionSkills.join(', '))].join('');
  const education=[data.education.qualification?`<p class="strong">${escape(data.education.qualification)}</p>`:'',line('Institution',data.education.institution),line('Location',data.education.location),line('Year',data.education.year),line('Training status',data.trainingStatus)].join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(data.name)} Driver Resume</title><style>
  *{box-sizing:border-box}body{font:10.5pt Arial,Helvetica,sans-serif;line-height:1.4;color:#21313b;background:white;margin:0;padding:24px;max-width:794px}header{border-bottom:3px solid #116864;padding-bottom:14px;margin-bottom:18px}h1{font-size:26pt;line-height:1.1;margin:0 0 6px;color:#163c44;overflow-wrap:anywhere}.title{font-size:12pt;font-weight:600;color:#116864;margin:0 0 8px}h2{text-transform:uppercase;font-size:10.5pt;letter-spacing:1px;color:#116864;margin:17px 0 7px;border-bottom:1px solid #d8e3e5;padding-bottom:5px;break-after:avoid}h3{font-size:10.5pt;margin:0 0 3px}.contact,.muted{font-size:9.5pt;color:#54646d}p{margin:4px 0;overflow-wrap:anywhere}ul{padding-left:18px;margin:5px 0}li{margin:3px 0;overflow-wrap:anywhere}.entry{margin:11px 0;break-inside:avoid;page-break-inside:avoid}.skills{display:flex;flex-wrap:wrap;gap:6px}.skill{font-size:9.5pt;padding:3px 8px;background:#edf4f4;border-radius:4px}.strong{font-weight:600}.demo{background:#fff0c4;color:#6a4900;padding:8px;font-weight:bold}section{break-inside:auto}@media print{body{padding:0;max-width:none}header{break-inside:avoid}p,li{orphans:2;widows:2}}
  </style></head><body>${demo?'<p class="demo">DUMMY SAMPLE · DEMO DATA ONLY</p>':''}<header><h1>${escape(data.name)}</h1><p class="title">${escape(data.title)}</p>${[data.location,data.phone,data.email].filter(Boolean).map(v=>`<p class="contact">${escape(v)}</p>`).join('')}</header>
  ${section('Professional Summary',data.summary?`<p>${escape(data.summary)}</p>`:'')}
  ${section('Driving Licence and Vehicle Skills',licence)}
  ${section('Work Experience',data.workExperience.length?data.workExperience.map(entry=>`<article class="entry"><h3>${escape(entry.jobTitle)} · ${escape(entry.employer)}</h3>${[entry.location,entry.period].filter(Boolean).map(v=>`<p class="muted">${escape(v)}</p>`).join('')}${entry.responsibilities.length?bullets(entry.responsibilities):''}</article>`).join(''):line('Saved driving experience',data.experienceDescription))}
  ${section('Key Skills',data.keySkills.length?`<div class="skills">${data.keySkills.map(v=>`<span class="skill">${escape(v)}</span>`).join('')}</div>`:'')}
  ${section('Education',education)}
  ${section('Languages and Availability',[line('Languages',data.languages.join(', ')),line('Working city',data.workingCity),line('Availability',data.availability),line('Service preferences',data.servicePreferences.join(', '))].join(''))}</body></html>`;
}
export function resumeHtml(record:Record<string,unknown>){return renderResumeHtml(projectResume(record).data);}
export async function getDriverResume(id:string){const result=projectResume(await getDriverById(id) as unknown as Record<string,unknown>);return {...result,html:renderResumeHtml(result.data)};}
export async function driverResumePdf(id:string,revision?:string){const resume=await getDriverResume(id);if(revision&&revision!==resume.revision)throw new HttpError(409,'RESUME_CHANGED','Driver resume changed. Reload the preview before downloading.');return renderBackendPdf(resume.html,true);}
export async function updateDriverResume(id:string,actorUserId:string,profile:ResumeProfile,revision:string,reason:string){
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Driver" WHERE "id" = ${id} FOR UPDATE`;
    const record=await tx.driver.findUnique({where:{id}});if(!record)throw new HttpError(404,'NOT_FOUND','Driver not found');
    const current=projectResume(record as unknown as Record<string,unknown>);if(current.revision!==revision)throw new HttpError(409,'RESUME_CHANGED','Driver resume changed. Reload before saving.');
    await tx.driver.update({where:{id},data:{resumeProfile:profile as Prisma.InputJsonValue}});
    await tx.auditLog.create({data:{actorUserId,action:'driver.resume.update',targetType:'Driver',targetId:id,before:current.profile,after:{profile,reason}}});
  });return getDriverResume(id);
}
export function resumeContentDisposition(filename:string){return `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;}
