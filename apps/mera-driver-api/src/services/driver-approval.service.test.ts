import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
import { createDriver, updateDriver } from './driver.service';
import { kycApprovalReadiness, pillItems } from './driver-pill.service';

const driver = { id: 'driver', firstName: 'Ravi', status: 'Non-Verified', dlNo: 'DL1420110012345', dlExpiryDate: '2099-01-01', onboardingStatus: 'completed', completedSubSteps: [10,11,12,13,20,21,30,31,32,40,41], documents: [] };
const passing = () => pillItems(driver).flatMap(p => p.items).filter(i => i.checkable).map(i => ({ itemKey: i.key, valueHash: i.hash, status: 'Pass' }));
beforeEach(() => {
  resetPrismaMock(); mockPrisma.driver.findUnique.mockResolvedValue(driver);
  mockPrisma.driverKycCheck.findMany.mockResolvedValue(passing());
});
describe('final KYC approval', () => {
  it('refuses direct creation as Verified', async () => {
    await expect(createDriver({ firstName: 'Ravi', status: 'Verified' })).rejects.toMatchObject({ code: 'KYC_REVIEW_REQUIRED' });
    expect(mockPrisma.driver.create).not.toHaveBeenCalled();
  });
  it('requires a current Pass for every check', async () => {
    mockPrisma.driverKycCheck.findMany.mockResolvedValue(passing().slice(1));
    await expect(updateDriver('driver', { status: 'Verified' })).rejects.toMatchObject({ code: 'KYC_REVIEW_REQUIRED' });
    expect(mockPrisma.driver.update).not.toHaveBeenCalled();
  });
  it('rejects a field edit and approval in the same payload using an old pass', async () => {
    await expect(updateDriver('driver', { firstName: 'Changed', status: 'Verified' })).rejects.toMatchObject({ code: 'KYC_REVIEW_REQUIRED' });
  });
  it('permits final approval only after current checks pass', async () => {
    await updateDriver('driver', { status: 'Verified' });
    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver' }, data: { status: 'Verified' } });
  });
  it('keeps human approval independent of the finance-only fee pill',async()=>{
    mockPrisma.driver.findUnique.mockResolvedValue({...driver,onboardingStatus:'in_progress',completedSubSteps:driver.completedSubSteps.filter(key=>key!==41)});
    await updateDriver('driver',{status:'Verified'});
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'driver'},data:{status:'Verified'}});
  });
  it('revokes an approval when a reviewed value changes', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ ...driver, status: 'Verified' });
    await updateDriver('driver', { firstName: 'Changed' });
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver' }, data: { firstName: 'Changed', status: 'Non-Verified' } });
  });
  it('rejects an expired licence even when all checks have passed', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ ...driver, dlExpiryDate: '2000-01-01' });
    await expect(updateDriver('driver', { status: 'Verified' })).rejects.toMatchObject({ code: 'KYC_REVIEW_REQUIRED' });
  });
  it('saves the last registration form on a pending driver without interpreting a carried status as approval',async()=>{
    mockPrisma.driver.findUnique.mockResolvedValue({...driver,completedSubSteps:driver.completedSubSteps.filter(k=>k!==41)});
    mockPrisma.driverKycCheck.findMany.mockResolvedValue([]);
    await updateDriver('driver',{status:'Verified',amount:'200',preferredPaymentMode:'Cash',stepCompleted:4,subStepCompleted:1});
    const data=mockPrisma.driver.update.mock.calls[0][0].data;
    expect(data).toMatchObject({amount:'200',onboardingStatus:'completed',completionPercentage:100});expect(data.status).toBeUndefined();
    expect(mockPrisma.driverKycCheck.findMany).not.toHaveBeenCalled();expect(mockPrisma.moneyMovement.create).not.toHaveBeenCalled();
  });
  it('creates a draft/new onboarding record with pending KYC even if a stale form carries Verified',async()=>{
    mockPrisma.driver.create.mockResolvedValue({id:'new'});
    await createDriver({firstName:'New',gender:'Male',status:'Verified',stepCompleted:1,subStepCompleted:0,completeStep:false});
    const data=mockPrisma.driver.create.mock.calls[0][0].data;expect(data.status).toBeUndefined();expect(data.completedSubSteps).toEqual([]);expect(data.onboardingStatus).toBe('in_progress');
  });
  it('saves draft fields without marking the pill complete or losing prior progress',async()=>{
    await updateDriver('driver',{amount:'150',stepCompleted:4,subStepCompleted:1,completeStep:false});
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'driver'},data:{amount:'150'}});
  });
  it('allows ordinary edits carrying an unchanged approved status without rerunning final approval',async()=>{
    mockPrisma.driver.findUnique.mockResolvedValue({...driver,status:'Verified',dlExpiryDate:'2000-01-01'});mockPrisma.driverKycCheck.findMany.mockResolvedValue([]);
    await updateDriver('driver',{status:'Verified',amount:'250'});
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'driver'},data:{status:'Verified',amount:'250'}});expect(mockPrisma.driverKycCheck.findMany).not.toHaveBeenCalled();
  });
  it('revokes approved KYC on sensitive edits even when the edit carries unchanged Verified',async()=>{
    mockPrisma.driver.findUnique.mockResolvedValue({...driver,status:'Verified'});
    await updateDriver('driver',{status:'Verified',firstName:'Changed'});
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'driver'},data:{status:'Non-Verified',firstName:'Changed'}});
  });
});

describe('shared approval readiness',()=>{
 it('identifies exact pending and stale fields despite eleven completed forms',()=>{const checks=passing();checks[0].valueHash='old';checks.splice(1,1);const r=kycApprovalReadiness(driver,checks);expect(r.ready).toBe(false);expect(r.reasons).toContain('Personal Details / Personal & Identity Details / First Name: Review required after changes');expect(r.reasons).toContain('Personal Details / Personal & Identity Details / Last Name: Pending');});
 it('does not add offline, optional fee or unconfirmed provider requirements',()=>{expect(kycApprovalReadiness({...driver,online:false,registrationFeeRequired:false},passing()).ready).toBe(true);});
});

it('revalidates an explicit approval even when the stored status already says Verified',async()=>{mockPrisma.driver.findUnique.mockResolvedValue({...driver,status:'Verified'});mockPrisma.driverKycCheck.findMany.mockResolvedValue([]);await expect(updateDriver('driver',{status:'Verified'},{explicitApproval:true})).rejects.toMatchObject({code:'KYC_REVIEW_REQUIRED',details:{ready:false}});expect(mockPrisma.driver.update).not.toHaveBeenCalled();});
