import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import type { Request } from 'express';
import { mockPrisma,resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('./permission.service',()=>({resolveEffectivePermissionsForUser:vi.fn()}));
import { resolveEffectivePermissionsForUser } from './permission.service';
import { accountDashboard } from './dashboard.service';
const stats={all:0,review:0,incomplete:0,missing:0,ready:0,today:0,pending:0,unassigned:0,unpaid:0,confirmed:0,cancelled:0,upcoming:0,ongoing:0,outstanding:0,collected:0,commission:0};
function request(userId:string,role:string){return {user:{sub:userId,roles:[role]},query:{userId:'other',vendorId:'other',companyId:'other',role:'super_admin'}} as unknown as Request;}
function setup(role:string,permissions:string[]){vi.mocked(resolveEffectivePermissionsForUser).mockResolvedValue(permissions);mockPrisma.role.findMany.mockResolvedValue([{key:role}]);}
beforeEach(()=>{resetPrismaMock();vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Provider calls forbidden');}));mockPrisma.user.findUniqueOrThrow.mockResolvedValue({name:'Actual User'});mockPrisma.driver.findMany.mockResolvedValue([]);mockPrisma.booking.findMany.mockResolvedValue([]);mockPrisma.driver.count.mockResolvedValue(0);mockPrisma.$queryRaw.mockResolvedValue([stats]);});
afterEach(()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();});
describe('Role dashboards',()=>{
  it.each(['super_admin','admin','vendor','marketing','sales','company','data_operator','support','kyc_verification'])('omits widgets without permissions for %s',async role=>{
    setup(role,[]);const dashboard=await accountDashboard(request('user',role));expect(dashboard.userName).toBe('Actual User');expect(dashboard.cards).toEqual([]);expect(dashboard.actions).toEqual([]);expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
  it.each(['vendor-1','vendor-2'])('uses caller ownership for vendor %s in all driver/booking aggregate queries',async userId=>{
    setup('vendor',['drivers:view','drivers:create','trips.bookings:view','payments.overview:view']);const dashboard=await accountDashboard(request(userId,'vendor'));
    expect(dashboard.cards.map(c=>c.title)).toEqual(['All Drivers','Need KYC Review','Missing Documents','Own Bookings']);
    for(const [sql] of mockPrisma.$queryRaw.mock.calls){expect(sql.values).toContain(userId);expect(sql.values).not.toContain('other');expect(sql.sql).toContain('"createdByUserId"');}
    expect(dashboard.cards.every(c=>c.value===0)).toBe(true);
  });
  it.each(['company-1','company-2'])('scopes company %s to its booking creator',async userId=>{
    setup('company',['trips.bookings:view','trips.bookings:create','payments.overview:view']);const dashboard=await accountDashboard(request(userId,'company'));
    expect(dashboard.cards).toHaveLength(4);const sql=mockPrisma.$queryRaw.mock.calls[0][0];expect(sql.values).toContain(userId);expect(sql.values).not.toContain('other');expect(mockPrisma.booking.findMany.mock.calls[0][0].where.AND[0]).toEqual({createdByUserId:userId});
  });
  it.each(['reviewer-1','reviewer-2'])('uses the same assigned-only scope for reviewer %s totals and queue',async userId=>{
    setup('kyc_verification',['kyc-assignments:view']);const dashboard=await accountDashboard(request(userId,'kyc_verification'));
    expect(dashboard.cards).toHaveLength(4);for(const [args] of mockPrisma.driver.count.mock.calls)expect(args.where.assignedVerifierId).toBe(userId);expect(mockPrisma.driver.findMany.mock.calls[0][0].where.assignedVerifierId).toBe(userId);
  });
  it('shows six supported Super Admin cards with explicit finance periods and destinations',async()=>{
    setup('super_admin',['drivers:view','drivers:assign','drivers:create','trips.bookings:view','payments.overview:view']);const dashboard=await accountDashboard(request('admin','super_admin'));
    expect(dashboard.cards).toHaveLength(6);expect(dashboard.cards.find(c=>c.key==='collections')?.hint).toContain('excludes driver COD');expect(dashboard.cards.every(c=>c.path.startsWith('/account/'))).toBe(true);
  });
  it('propagates failed queries instead of converting them to zero',async()=>{
    setup('company',['trips.bookings:view','trips.bookings:create']);mockPrisma.$queryRaw.mockRejectedValue(new Error('Database unavailable'));await expect(accountDashboard(request('company','company'))).rejects.toThrow('Database unavailable');
  });
});

it('gives an unknown role a Customer dashboard within its supported ownership scope',async()=>{
 setup('new_role',['dashboard:view','customers:view']);mockPrisma.role.findMany.mockResolvedValue([{key:'new_role',name:'Custom Team'}]);mockPrisma.customer.count.mockResolvedValue(2);
 const dashboard=await accountDashboard(request('new-user','new_role'));
 expect(dashboard.role).toBe('Custom Team');expect(dashboard.cards).toEqual([expect.objectContaining({key:'customers',value:2})]);
 expect(mockPrisma.customer.count).toHaveBeenCalledWith({where:{createdByUserId:'new-user'}});expect(dashboard.actions).toContainEqual({label:'Customer Lookup',path:'/account/customers'});
 expect(dashboard.actions.some(action=>action.label==='Add Customer')).toBe(false);
});
it('gives a custom review role its actual assigned work without a built-in role key',async()=>{
 setup('review_team',['dashboard:view','kyc-assignments:view']);const dashboard=await accountDashboard(request('reviewer','review_team'));
 expect(dashboard.cards.map(card=>card.key)).toEqual(['assigned','pending','issues','completed']);expect(mockPrisma.driver.count).toHaveBeenCalledWith({where:{assignedVerifierId:'reviewer'}});
});
