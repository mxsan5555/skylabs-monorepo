import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
import { DriverListQuery, driverListWhere, searchDrivers } from './driver-list.service';
beforeEach(resetPrismaMock);
describe('Driver record and login views', () => {
  it('all records includes linked and unlinked records', () => { expect(driverListWhere(DriverListQuery.parse({}))).toEqual({}); });
  it('combines search with login, KYC, account, state, source and skills', () => {
    const where = driverListWhere(DriverListQuery.parse({ search: 'DL123', login: 'unlinked', status: 'Non-Verified', accountStatus: 'Active', state: 'UP', sourceType: 'Website', driverType: 'LMV' }));
    expect(where).toMatchObject({ userId: null, status: 'Non-Verified', accountStatus: 'Active', state: 'UP', sourceType: 'Website', driverType: { contains: 'LMV' } });
    expect(where.OR).toHaveLength(6);
    expect(where.OR).toContainEqual({ dlNo: { contains: 'DL123', mode: 'insensitive' } });
  });
  it('driver users is a filter on Driver, not a second entity', () => { expect(driverListWhere(DriverListQuery.parse({ login: 'linked' }))).toEqual({ userId: { not: null } }); });
  it('Needs Review includes every KYC status awaiting final approval',()=>expect(driverListWhere(DriverListQuery.parse({status:'Needs Review'}))).toEqual({status:{not:'Verified'}}));
  it('combines policy filters with online availability and server pagination',async()=>{
    mockPrisma.$queryRaw.mockResolvedValueOnce([{totalDrivers:100000,driverUsers:40000,kycPending:50000,feeUnpaid:7,readyForTrips:2}]).mockResolvedValueOnce([]);
    const result=await searchDrivers({fee:'Paid',eligibility:'ready',licence:'Manual approved',availability:'online',page:2,pageSize:10});
    const sql=mockPrisma.$queryRaw.mock.calls[1][0];expect(sql.sql).toContain('LIMIT ? OFFSET ?');expect(sql.values.slice(-2)).toEqual([10,10]);expect(sql.values).toContain('Paid');expect(sql.values).toContain('Manual approved');expect(result.meta.summary).toMatchObject({feeUnpaid:7,readyForTrips:2});expect(mockPrisma.driver.findMany).not.toHaveBeenCalled();
  });
  it('bounds pagination and rejects unknown sort columns', () => {
    expect(() => DriverListQuery.parse({ pageSize: 10000 })).toThrow();
    expect(() => DriverListQuery.parse({ sort: 'passwordHash' })).toThrow();
  });
  it('returns a validation error for invalid API filters', async () => {
    await expect(searchDrivers({ page: 0 })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    expect(mockPrisma.driver.findMany).not.toHaveBeenCalled();
  });
  it('uses stable server-side sorting, pagination and full count',async()=>{
    mockPrisma.$queryRaw.mockResolvedValueOnce([{totalDrivers:100000,driverUsers:20000,kycPending:1000,readyForTrips:2,feeUnpaid:9}]).mockResolvedValueOnce([]);
    const result=await searchDrivers({page:2000,pageSize:50,sort:'firstName',direction:'asc'});const sql=mockPrisma.$queryRaw.mock.calls[1][0];expect(sql.sql).toContain('d."firstName" ASC,d.id ASC');expect(sql.values.slice(-2)).toEqual([50,99950]);expect(result.meta.total).toBe(100000);expect(result.rows).toEqual([]);
  });
  it('scopes the list to the caller-owned createdByUserId when an owner scope is given (Vendor/Sales/Data Operator)',async()=>{
    mockPrisma.$queryRaw.mockResolvedValueOnce([{totalDrivers:1,driverUsers:0,kycPending:0,readyForTrips:0,feeUnpaid:0}]).mockResolvedValueOnce([]);
    await searchDrivers({},{ownerUserId:'vendor-1'});
    const sql=mockPrisma.$queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain('d."createdByUserId"');
    expect(sql.values).toContain('vendor-1');
  });
  it('does not add an ownership filter when ownerUserId is null (Admin/Super Admin, full queue)',async()=>{
    mockPrisma.$queryRaw.mockResolvedValueOnce([{totalDrivers:1,driverUsers:0,kycPending:0,readyForTrips:0,feeUnpaid:0}]).mockResolvedValueOnce([]);
    await searchDrivers({},{ownerUserId:null});
    const sql=mockPrisma.$queryRaw.mock.calls[0][0];
    expect(sql.sql).not.toContain('d."createdByUserId"');
  });
});

it('summary facets retain search, city, KYC and availability independently of the selected view',async()=>{
  mockPrisma.$queryRaw.mockResolvedValueOnce([{totalDrivers:20,driverUsers:2,kycPending:0,readyForTrips:1,feeUnpaid:0}]).mockResolvedValueOnce([]);
  const result=await searchDrivers({view:'users',search:'Ravi',city:'Pune',status:'Verified',availability:'online'});
  const summary=mockPrisma.$queryRaw.mock.calls[0][0],page=mockPrisma.$queryRaw.mock.calls[1][0];expect(summary.values).toContain('Pune');expect(summary.values).toContain('Verified');expect(summary.values).toContain('%Ravi%');expect(page.sql).toContain('WHERE p."userId" IS NOT NULL');expect(result.meta.total).toBe(2);expect(result.meta.summary.totalDrivers).toBe(20);
});
it('ready view never bypasses fee filters or availability',async()=>{
  mockPrisma.$queryRaw.mockResolvedValueOnce([{totalDrivers:1,driverUsers:1,kycPending:0,readyForTrips:0,feeUnpaid:1}]).mockResolvedValueOnce([]);
  const result=await searchDrivers({view:'ready',fee:'Unpaid',availability:'online'});const sql=mockPrisma.$queryRaw.mock.calls[1][0];expect(sql.sql).toContain('WHERE p."readyForTrips"');expect(sql.values).toContain('Unpaid');expect(sql.values).toContain(true);expect(result.meta.total).toBe(0);
});
it('searches a full name across first and last name while retaining phone/ID/email/DL search',()=>{
  const where=driverListWhere(DriverListQuery.parse({search:'Ravi Kumar'}));expect(where.OR).toHaveLength(7);expect(where.OR?.[6]).toEqual({AND:[{OR:[{firstName:{contains:'Ravi',mode:'insensitive'}},{lastName:{contains:'Ravi',mode:'insensitive'}}]},{OR:[{firstName:{contains:'Kumar',mode:'insensitive'}},{lastName:{contains:'Kumar',mode:'insensitive'}}]}]});
});

it('ignores availability even in old URLs instead of restricting the registry',()=>{
 const query=DriverListQuery.parse({availability:'offline'});expect(query).not.toHaveProperty('availability');expect(driverListWhere(query)).not.toHaveProperty('online');
});
it('prefills Paid details from the confirmed movement instead of stale form fields',async()=>{
 mockPrisma.$queryRaw.mockResolvedValueOnce([{totalDrivers:1,driverUsers:0,kycPending:0,readyForTrips:0,feeUnpaid:0}]).mockResolvedValueOnce([{id:'driver',feeStatus:'Paid'}]);
 mockPrisma.driver.findMany.mockResolvedValue([{id:'driver',firstName:'Ravi',documents:[],completedSubSteps:[],accountStatus:'Active',dlNo:null,dob:null,preferredPaymentMode:'Cash',amount:'999',paymentReceiptDate:'1990-01-01',financialMovements:[{reference:'razorpay:fixture',method:'razorpay:upi',amountPaise:50000,createdAt:new Date('2026-10-06T10:00:00Z'),reason:'Captured provider payment verified on backend'}]}]);
 mockPrisma.auditLog.findMany.mockResolvedValue([]);
 const result=await searchDrivers({});expect(result.rows[0]).toMatchObject({feeStatus:'Paid',amount:'500',preferredPaymentMode:'Online',paymentReceiptDate:'2026-10-06',registrationPaymentReference:'razorpay:fixture'});expect(result.rows[0]).not.toHaveProperty('financialMovements');
});
