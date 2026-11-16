import { beforeEach, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('./driver-pdf.service',()=>({renderBackendPdf:vi.fn().mockResolvedValue(Buffer.from('%PDF-fixture'))}));
import { driverResumePdf, formatResumeDate, getDriverResume, projectResume, renderResumeHtml, updateDriverResume } from './driver-resume.service';
import { ResumeProfileSchema } from '../schemas/driver-resume.schema';
import { renderBackendPdf } from './driver-pdf.service';
beforeEach(()=>resetPrismaMock());
const record={id:'driver',firstName:'Actual',lastName:'Driver',city:'Pune',state:'Maharashtra',experience:'5+ Years',driverType:'Car Driver',vehicleType:'Sedan, SUV',licenseDetails:'LMV',dlNo:'SAVED_DL',dlExpiryDate:'2099-01-01',education:'Graduate',language:'Hindi',languages:['English'],bankAccountNo:'PRIVATE_BANK',dob:'PRIVATE_DOB',verificationNotes:'PRIVATE_ISSUE',documents:[{regNo:'PRIVATE_AADHAAR'}]};
const profile=ResumeProfileSchema.parse({workExperience:[{jobTitle:'Company Driver',employer:'Saved Employer',startDate:'2020-01',endDate:'2022-09',responsibilities:['Saved responsibility']},{jobTitle:'Family Driver',employer:'Current Employer',startDate:'2022-10',current:true}],education:{institution:'Saved College',location:'Pune',year:'2018'},transmissionSkills:['Manual'],keySkills:['Route planning'],availability:'Weekdays',servicePreferences:['Local']});
it('uses every saved resume source in the requested section order without inventing employment',()=>{
  const projected=projectResume({...record,resumeProfile:profile});const html=renderResumeHtml(projected.data);
  const headings=['Professional Summary','Driving Licence and Vehicle Skills','Work Experience','Key Skills','Education','Languages and Availability'];
  expect(headings.map(title=>html.indexOf(`<h2>${title}</h2>`))).toEqual(headings.map(title=>html.indexOf(`<h2>${title}</h2>`)).sort((a,b)=>a-b));
  for(const value of ['SAVED_DL','Saved Employer','Current Employer','Present','Saved responsibility','Saved College','Route planning','English, Hindi','Weekdays'])expect(html).toContain(value);
  for(const value of ['PRIVATE_BANK','PRIVATE_DOB','PRIVATE_ISSUE','PRIVATE_AADHAAR','DUMMY SAMPLE','undefined','null'])expect(html).not.toContain(value);
  expect(projected.data.summary).toContain('5+ Years');expect(projected.data.summary).not.toContain('5 years');expect(projected.filename).toBe('Actual_Driver_Driver_Resume.pdf');
});
it('omits missing sections and exposes explicit admin missing-field indicators for partial records',()=>{
  const result=projectResume({firstName:'Partial'});const html=renderResumeHtml(result.data);expect(result.missing).toContain('Professional summary');expect(html).not.toContain('<section>');expect(html).not.toContain('Not provided');expect(html).not.toContain('DUMMY SAMPLE');expect(renderResumeHtml(result.data,true)).toContain('DUMMY SAMPLE');
});
it('omits contact lines when sharing is disabled and escapes all saved facts',()=>{
  const html=renderResumeHtml(projectResume({...record,email:'PRIVATE_EMAIL',phone:'PRIVATE_PHONE',resumeProfile:{...profile,summary:'<script>saved</script>',shareEmail:false,sharePhone:false}}).data);expect(html).not.toContain('PRIVATE_EMAIL');expect(html).not.toContain('PRIVATE_PHONE');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
});
it('does not label expired, invalid or unconfirmed licences verified',()=>{
  expect(projectResume({...record,dlExpiryDate:'2000-01-01'}).data.licence.validity).toBe('Expired');expect(projectResume({...record,dlExpiryDate:'2026-02-30'}).data.licence.validity).toBe('Validity not confirmed');expect(formatResumeDate('2026-02-30')).toBe('');expect(formatResumeDate('2020-12')).toContain('2020');expect(renderResumeHtml(projectResume(record).data)).not.toContain('API verified');
});
it.each([{workExperience:[{jobTitle:'Driver',employer:'Employer',current:true,endDate:'2025-01'}]},{workExperience:[{jobTitle:'Driver',employer:'Employer',startDate:'2025-01',endDate:'2024-01'}]},{workExperience:[{jobTitle:'Driver',employer:'Employer',startDate:'2025-02-30'}]},{summary:'Saved',verified:true}])('rejects invalid or misleading resume-specific source data: %j',value=>expect(ResumeProfileSchema.safeParse(value).success).toBe(false));
it('renders the exact preview snapshot and refuses stale PDF requests',async()=>{
  mockPrisma.driver.findUnique.mockResolvedValue({...record,resumeProfile:profile});const preview=await getDriverResume('driver');await driverResumePdf('driver',preview.revision);expect(renderBackendPdf).toHaveBeenCalledWith(preview.html,true);await expect(driverResumePdf('driver','0'.repeat(64))).rejects.toMatchObject({code:'RESUME_CHANGED'});
});
it('audits changes without changing KYC, onboarding or finance and prevents stale writes',async()=>{
  mockPrisma.driver.findUnique.mockResolvedValue(record);const snapshot=await getDriverResume('driver');await updateDriverResume('driver','admin',profile,snapshot.revision,'Confirmed employment');expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'driver'},data:{resumeProfile:profile}});expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorUserId:'admin',action:'driver.resume.update',after:{profile,reason:'Confirmed employment'}})}));mockPrisma.driver.update.mockClear();await expect(updateDriverResume('driver','admin',profile,'0'.repeat(64),'Confirmed employment')).rejects.toMatchObject({code:'RESUME_CHANGED'});expect(mockPrisma.driver.update).not.toHaveBeenCalled();
});
