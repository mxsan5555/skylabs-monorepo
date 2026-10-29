import { prisma } from '../lib/prisma';
import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errorHandler';
import { buildDlRequest, dlConfiguration, dlRequestEnabled, requireDlContract, sendDlRequest } from '../providers/idspay/dl.provider';
import { normalizeDlDate, normalizeDlNumber } from '../providers/idspay/dl.response';

type SavedLicence = { dlNo:string|null;dob:string|null;userId?:string|null;phone?:string|null;firstName?:string;lastName?:string|null };
const legacyHash=(driver:SavedLicence)=>createHash('sha256').update(JSON.stringify([driver.dlNo?.trim(),driver.dob])).digest('hex');
export const submissionHash=(driver:SavedLicence)=>createHash('sha256').update(JSON.stringify([normalizeDlNumber(driver.dlNo)??driver.dlNo?.trim(),normalizeDlDate(driver.dob)??driver.dob])).digest('hex');
const matches=(value:unknown,driver:SavedLicence)=>[submissionHash(driver),legacyHash(driver)].includes((value as {submissionHash?:string}|null)?.submissionHash??'');
function validateSaved(driver:SavedLicence){buildDlRequest(driver,{url:'',apiId:'',apiKey:'',tokenId:''});}
const nameHash=(driver:SavedLicence)=>createHash('sha256').update(JSON.stringify([driver.firstName??'',driver.lastName??''])).digest('hex');
const attemptMatches=(value:unknown,driver:SavedLicence)=>matches(value,driver)&&(!(value as {checkedNameHash?:string}|null)?.checkedNameHash||(value as {checkedNameHash:string}).checkedNameHash===nameHash(driver));
export function dlResultMessage(status:string,reason:string,checks?:{licenceNumber?:boolean|null;dob?:boolean|null}){
  if(status==='Invalid / no record found')return 'No licence record found. Check the saved DL number and DOB.';
  if(status==='API verified')return 'Saved DL number, date of birth and holder details match a current licence.';
  if(status==='Expired')return 'The confirmed licence validity has expired. Correct or renew the licence before review.';
  if(status==='Mismatch/Invalid'&&(checks?.licenceNumber===false||checks?.dob===false))return [checks?.licenceNumber===false?'The returned DL number does not match the saved DL number.':null,checks?.dob===false?'The returned date of birth does not match the saved DOB.':null].filter(Boolean).join(' ');
  if(status==='Mismatch/Invalid')return reason==='HOLDER_NAME_MISMATCH'?'The returned holder name differs from the saved driver name. Review and correct the details.':reason==='VEHICLE_CLASS_MISMATCH'?'The returned vehicle class does not match the required class.':'The returned DL number or date of birth differs from the saved details.';
  if(reason==='IDSPAY_AUTHENTICATION_FAILED')return 'IDSPay authentication failed. Ask an administrator to check the configured credentials and token.';
  if(reason==='IDSPAY_NOT_CONFIGURED'||reason==='IDSPAY_ENDPOINT_INVALID')return 'Verification is unavailable. Ask an administrator to check the IDSPay configuration.';
  if(reason==='APPLICABLE_VALIDITY_UNCONFIRMED')return 'The applicable licence validity could not be established. Review the returned licence information.';
  if(reason==='Provider request timed out')return 'IDSPay did not respond in time. Retry deliberately.';
  return 'Verification could not be completed. Try again.';
}
export async function dlReviewState(driverId:string, driver:SavedLicence){
  const history=await prisma.auditLog.findMany({where:{targetType:'Driver',targetId:driverId,action:{startsWith:'driver.dl.'}},orderBy:{createdAt:'desc'},take:100});
  const current=(history??[]).filter(row=>matches(row.after,driver));
  const attempt=current.find(row=>['driver.dl.verification','driver.dl.preflight'].includes(row.action)&&attemptMatches(row.after,driver));
  const saved=attempt?.after as {status?:string;reason?:string;providerCalled?:boolean;trustedAssessment?:boolean;identityMatch?:boolean|null;validFrom?:string|null;validTo?:string|null;issueDate?:string|null;vehicleClasses?:string[];validityCategory?:string;providerReference?:string|null;clientReference?:string|null;checks?:{licenceNumber?:boolean|null;dob?:boolean|null}}|null;
  const trusted=saved?.providerCalled===true&&saved.trustedAssessment===true;
  let status=attempt?trusted&&['API verified','Expired','Mismatch/Invalid','Invalid / no record found','Provider failed','Manual review required'].includes(saved?.status??'')?saved!.status!:['Provider failed','Manual review required'].includes(saved?.status??'')?saved!.status!:'Manual review required':'Not checked';
  if(status==='API verified'&&(!saved?.identityMatch||!normalizeDlDate(saved.validTo)))status='Manual review required';
  if(status==='API verified'&&saved!.validTo!<new Date().toISOString().slice(0,10))status='Expired';
  const reasonCode=saved?.reason??(status==='Not checked'?'NOT_CHECKED':'IDSPAY_REQUEST_DETAILS_MISSING');
  const checker=attempt?.actorUserId?await prisma.user.findUnique({where:{id:attempt.actorUserId},select:{name:true}}):null;
  return {submissionHash:submissionHash(driver),enabled:dlRequestEnabled()||trusted,status,checkedById:attempt?.actorUserId??null,checkedByName:checker?.name??null,
    inputs:{dlNo:driver.dlNo,dob:driver.dob},checkedAt:attempt?.createdAt??null,providerCalled:!!saved?.providerCalled,identityMatch:trusted?saved?.identityMatch??null:null,
    validFrom:trusted?saved?.validFrom??null:null,validTo:trusted?saved?.validTo??null:null,issueDate:trusted?saved?.issueDate??null:null,vehicleClasses:trusted?saved?.vehicleClasses??[]:[],validityCategory:trusted?saved?.validityCategory??null:null,providerReference:saved?.providerReference??null,clientReference:saved?.clientReference??null,
    reasonCode,reason:status==='Not checked'?'Verify the saved driving licence.':dlResultMessage(status,reasonCode,saved?.checks),
    history:(history??[]).map(row=>{const r=row.after as typeof saved;return {id:row.id,createdAt:row.createdAt,initiatorId:row.actorUserId,action:row.action,summary:{status:r?.status,reason:r?.status?dlResultMessage(r.status,r.reason??''):undefined,providerCalled:r?.providerCalled,consent:(r as {consent?:boolean}|null)?.consent,source:(r as {source?:string}|null)?.source,actorType:(r as {actorType?:string}|null)?.actorType,providerReference:r?.providerReference}};})};
}
/** Existing assigned-review action. Row lock serializes saved-input checks and paid calls. */
export async function dlVerificationPreflight(driverId:string,reviewerId:string,retry=false,options?:{administrative:boolean}){
  const requestedAt=Date.now();
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Driver" WHERE id=${driverId} FOR UPDATE`;
    const driver=await tx.driver.findFirst({where:{id:driverId,...(options?.administrative?{}:{assignedVerifierId:reviewerId})}});
    if(!driver)throw new HttpError(404,'NOT_FOUND','Assigned driver not found');
    validateSaved(driver);
    const hash=submissionHash(driver);
    const history=await tx.auditLog.findMany({where:{targetType:'Driver',targetId:driverId,action:{in:['driver.dl.preflight','driver.dl.verification']}},orderBy:{createdAt:'desc'}});
    const current=(history??[]).filter(row=>matches(row.after,driver));
    const previous=current.find(row=>['driver.dl.preflight','driver.dl.verification'].includes(row.action)&&attemptMatches(row.after,driver));
    const obsoleteGate=previous?.action==='driver.dl.preflight'&&!(previous.after as {providerCalled?:boolean})?.providerCalled&&['IDSPAY_REQUEST_DETAILS_MISSING','IDSPAY_CONTRACT_UNCONFIRMED'].includes((previous.after as {reason?:string})?.reason??'');
    if(previous&&!obsoleteGate&&(!retry||new Date(previous.createdAt).getTime()>=requestedAt))return previous.after;
    let summary:Record<string,unknown>,providerCalled=false;
    try{
      const config=dlConfiguration(),contract=requireDlContract();
      const body=buildDlRequest(driver,config);
      providerCalled=true;
      const result=await sendDlRequest(config,body,contract.method,fetch,10_000,{expectedName:[driver.firstName,driver.lastName].filter(Boolean).join(' ')||undefined},contract.headers);
      summary={...result,submissionHash:hash,checkedNameHash:nameHash(driver),providerCalled:true,trustedAssessment:true,retry};
    }catch(error){const reason=error instanceof HttpError?error.code:'VERIFICATION_FAILED';summary={submissionHash:hash,status:reason==='IDSPAY_REQUEST_DETAILS_MISSING'?'Manual review required':'Provider failed',reason,providerCalled,retry};}
    await tx.auditLog.create({data:{createdAt:new Date(),actorUserId:reviewerId,action:providerCalled?'driver.dl.verification':'driver.dl.preflight',targetType:'Driver',targetId:driverId,after:summary as never}});
    return summary;
  },{timeout:15_000,maxWait:15_000});
}
