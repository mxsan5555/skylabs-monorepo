import request from 'supertest';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mockPrisma,resetPrismaMock} from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('../services/trip-workflow.service',()=>({driverEligibility:vi.fn(async id=>({driver:{id},fee:'Unpaid',reasons:[]})),driverTrips:vi.fn(async()=>[]),driverOffers:vi.fn(async()=>[])}));
vi.mock('../services/driver-pdf.service',()=>({driverPdf:vi.fn(async()=>Buffer.from('%PDF-1.7\nfixture document\n%%EOF'))}));
import {app} from '../app';
import {signAccessToken} from '../lib/jwt';
import {invalidatePermissionCache} from '../services/permission.service';
import {driverEligibility} from '../services/trip-workflow.service';
const token=(roles=['driver'])=>signAccessToken({sub:'own-user',roles,app:'mera-driver'});
beforeEach(()=>{resetPrismaMock();invalidatePermissionCache();vi.mocked(driverEligibility).mockClear();mockPrisma.moneyMovement.findMany.mockResolvedValue([]);mockPrisma.auditLog.findMany.mockResolvedValue([]);});
describe('mounted workflow and PDF routes',()=>{
 it.each(['driver-a','driver-b'])('scopes own dashboard trip count to linked driver %s',async id=>{
   mockPrisma.driver.findUnique.mockResolvedValue({id,accountStatus:'Active'});mockPrisma.booking.count.mockResolvedValue(0);
   const r=await request(app).get('/workflow/driver/dashboard?driverId=someone-else').set('Authorization','Bearer '+signAccessToken({sub:id+'-user',roles:['driver'],app:'mera-driver'}));
   expect(r.status).toBe(200);expect(r.body.data.upcoming).toBe(0);expect(mockPrisma.booking.count.mock.calls[0][0].where.driverId).toBe(id);expect(r.headers['cache-control']).toContain('no-store');
 });
 it.each(['customer-a','customer-b'])('scopes own payment dashboard to linked customer %s',async id=>{
   mockPrisma.customer.findUnique.mockResolvedValue({id,accountStatus:'Active'});mockPrisma.$queryRaw.mockResolvedValue([{total:0,upcoming:0,completed:0,pendingPaise:0}]);
   const r=await request(app).get('/workflow/customer/dashboard?customerId=someone-else').set('Authorization','Bearer '+signAccessToken({sub:id+'-user',roles:['customer'],app:'mera-driver'}));
   expect(r.status).toBe(200);expect(mockPrisma.$queryRaw.mock.calls[0][0].values).toContain(id);expect(mockPrisma.$queryRaw.mock.calls[0][0].values).not.toContain('someone-else');expect(r.headers['cache-control']).toContain('no-store');
 });
 it('mounts own driver overview and requires authentication instead of returning a route 404',async()=>{const r=await request(app).get('/workflow/driver/overview');expect(r.status).toBe(401);});
 it('resolves the linked driver from JWT and ignores query identity',async()=>{mockPrisma.driver.findUnique.mockResolvedValue({id:'own-driver',accountStatus:'Active'});const r=await request(app).get('/workflow/driver/overview?driverId=other').set('Authorization','Bearer '+token());expect(r.status).toBe(200);expect(r.body.data.driver.id).toBe('own-driver');expect(driverEligibility).toHaveBeenCalledWith('own-driver');expect(mockPrisma.driver.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'own-user'}}));});
 it('staff overview uses plural drivers and enforces staff view permission',async()=>{mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([]);const r=await request(app).get('/workflow/drivers/other/overview').set('Authorization','Bearer '+token());expect(r.status).toBe(403);});
 it('mounts staff overview with drivers:view',async()=>{mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([{permission:{key:'drivers:view'}}]);const r=await request(app).get('/workflow/drivers/other/overview').set('Authorization','Bearer '+token(['admin']));expect(r.status).toBe(200);expect(r.body.data.driver.id).toBe('other');});
 it('denies PDF export without drivers:export',async()=>{mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([]);const r=await request(app).get('/drivers/other/profile.pdf').set('Authorization','Bearer '+token());expect(r.status).toBe(403);});
 it('returns binary PDF headers and filename for authorized staff',async()=>{mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([{permission:{key:'drivers:export'}}]);const r=await request(app).get('/drivers/other/profile.pdf').set('Authorization','Bearer '+token(['admin']));expect(r.status).toBe(200);expect(r.headers['content-type']).toContain('application/pdf');expect(r.headers['content-disposition']).toBe('attachment; filename="driver-other.pdf"');expect(r.body.subarray(0,5).toString()).toBe('%PDF-');expect(r.body.length).toBeGreaterThan(20);});
});

it('denies driver/customer finance writes and requires explicit confirmed manual settlement',async()=>{
 mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([]);
 const body={reference:'receipt',bookingId:'11111111-1111-4111-8111-111111111111',kind:'booking_payment',amountPaise:100000,method:'cash',reason:'Actual collection'};
 expect((await request(app).post('/workflow/accounts/movements').set('Authorization','Bearer '+token(['driver'])).send({...body,confirmed:true})).status).toBe(403);
 invalidatePermissionCache();mockPrisma.rolePermission.findMany.mockResolvedValue([{permission:{key:'payments.overview:edit'}},{permission:{key:'payments.overview:create'}}]);
 expect((await request(app).post('/workflow/accounts/movements').set('Authorization','Bearer '+token(['admin'])).send(body)).status).toBe(422);expect(mockPrisma.moneyMovement.create).not.toHaveBeenCalled();
});

it('generic accounting Edit cannot confirm funds without creation authority',async()=>{
  mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([{permission:{key:'payments.overview:edit'}}]);
  const response=await request(app).post('/workflow/accounts/movements').set('Authorization','Bearer '+token(['admin'])).send({});expect(response.status).toBe(403);expect(mockPrisma.moneyMovement.create).not.toHaveBeenCalled();
});

it('requires Accounts View for scoped fee and booking detail reads',async()=>{
 mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([]);
 const fee=await request(app).get('/workflow/accounts/drivers/11111111-1111-4111-8111-111111111111/fee').set('Authorization','Bearer '+token(['admin']));
 const booking=await request(app).get('/workflow/accounts/bookings/11111111-1111-4111-8111-111111111111').set('Authorization','Bearer '+token(['admin']));
 expect(fee.status).toBe(403);expect(booking.status).toBe(403);
});

it('keeps fee record lookup within the staff driver ownership scope',async()=>{
 mockPrisma.role.findMany.mockResolvedValue([{key:'sales',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([{permission:{key:'payments.overview:view'}}]);
 const id='11111111-1111-4111-8111-111111111111';const response=await request(app).get(`/workflow/accounts/drivers/${id}/fee`).set('Authorization','Bearer '+token(['sales']));
 expect(response.status).toBe(404);expect(mockPrisma.driver.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{id,createdByUserId:'own-user'}}));
});
