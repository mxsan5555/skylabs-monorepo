import { beforeEach, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
import { driverDetails } from './driver-details.service';
import { DRIVER_PILLS } from './driver-pill.service';
import { resumeHtml } from './driver-resume.service';
beforeEach(()=>{resetPrismaMock();mockPrisma.driverKycCheck.findMany.mockResolvedValue([]);mockPrisma.driverKycDecision.findMany.mockResolvedValue([]);mockPrisma.moneyMovement.findMany.mockResolvedValue([]);mockPrisma.paymentIntent.findMany.mockResolvedValue([]);mockPrisma.booking.count.mockResolvedValue(0);});
it.each([{completedSubSteps:[]},{completedSubSteps:[10,11,12,13,20,21,30,31,32,40,41]}])('projects every onboarding field, extras, current and archived originals without raw paths: %j',async({completedSubSteps})=>{
  const doc=(id:string,type:string,category:string,archivedAt:Date|null)=>({id,type,category,fileName:`${id}.pdf`,filePath:`drivers/driver/${id}.pdf`,version:archivedAt?1:2,archivedAt,createdAt:new Date(),expiresAt:null});
  mockPrisma.driver.findUnique.mockResolvedValue({id:'driver',firstName:'Ravi',accountStatus:'Active',status:'Non-Verified',completedSubSteps,online:false,registrationFeePaise:20000,registrationFeeRequired:true,passportNumber:'saved legacy',documentUpload:'D:\\private\\file.pdf',documents:[doc('old','Driving License','personal',new Date()),doc('new','Driving License','personal',null),doc('edu','Certificate','education',null)]});
  const result=await driverDetails('driver');const fields=result.sections.flatMap(s=>s.fields);
  for(const key of DRIVER_PILLS.flatMap(p=>p.fields))expect(fields.some(f=>f.key===key)).toBe(true);
  expect(fields.find(f=>f.key==='passportNumber')?.value).toBe('saved legacy');
  expect(fields.find(f=>f.key==='bankName')?.value).toBeNull();
  const docs=result.sections.flatMap(s=>s.documents);expect(docs.map(d=>d.id).sort()).toEqual(['edu','new','old']);expect(result.sections.find(s=>s.title.includes('Driving License'))?.documents).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain('filePath');expect(JSON.stringify(result)).not.toContain('D:\\private');expect(result.reasons).toContain('Required registration fee is not settled');
});
it('keeps shareable resumes free of internal identity, documents, KYC and financial data and escapes HTML',()=>{
  const html=resumeHtml({firstName:'<script>evil</script>',experience:'Five years',dob:'PRIVATE_DOB',dlNo:'PRIVATE_DL',bankAccountNo:'PRIVATE_BANK',address:'PRIVATE_ADDRESS',documents:'PRIVATE_DOC',verificationNotes:'PRIVATE_KYC',registrationFeePaise:'PRIVATE_FEE'});
  expect(html).toContain('Five years');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('PRIVATE_DL');for(const value of ['PRIVATE_DOB','PRIVATE_BANK','PRIVATE_ADDRESS','PRIVATE_DOC','PRIVATE_KYC','PRIVATE_FEE'])expect(html).not.toContain(value);expect(html).not.toContain('undefined');
});
it.each(['drivers/driver/photo.png','photo.png'])('resolves a saved profile photo to the existing protected original: %s',async avatar=>{
  mockPrisma.driver.findUnique.mockResolvedValue({id:'driver',firstName:'Actual',lastName:'Driver',city:'Pune',state:'Maharashtra',phone:'9876543210',email:'fixture@example.org',avatar,online:true,status:'Non-Verified',accountStatus:'Active',currentStep:2,currentSubStep:1,onboardingStatus:'in_progress',completionPercentage:45,completedSubSteps:[10,11,12,13,20],documents:[{id:'photo',type:'Profile Photo',category:'personal',fileName:'photo.png',filePath:'drivers/driver/photo.png',mimeType:'image/png',version:2,archivedAt:null}]});
  const result=await driverDetails('driver');expect(result.photo).toBe('/uploads/drivers/driver/photo.png');expect(result).toMatchObject({city:'Pune',state:'Maharashtra',phone:'9876543210',availability:'Online',onboarding:{percentage:45,completed:5,total:11,tab:'Education & Health Details',pill:'Health & Medical Specifications'}});expect(result.sections.flatMap(s=>s.documents)).toHaveLength(1);expect(JSON.stringify(result)).not.toContain('filePath');
});
it('does not invent a photo from a filename when the original was never uploaded',async()=>{mockPrisma.driver.findUnique.mockResolvedValue({id:'driver',firstName:'Partial',avatar:'never-uploaded.png',completedSubSteps:[],documents:[]});expect((await driverDetails('driver')).photo).toBeNull();});
