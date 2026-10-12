import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('../services/trip-workflow.service',()=>({ACTIVE_TRIPS:['confirmed','on_the_way','arrived','in_progress'],dispatchCandidates:vi.fn(async()=>[]),assignTrip:vi.fn(async()=>({status:'confirmed'}))}));
import { app } from '../app';
import { signAccessToken } from '../lib/jwt';
import { assignTrip, dispatchCandidates } from '../services/trip-workflow.service';
const id='11111111-1111-4111-8111-111111111111',driverId='22222222-2222-4222-8222-222222222222';
const token=()=>signAccessToken({sub:'staff',roles:['admin'],app:'mera-driver',portalContext:'staff'});
beforeEach(()=>{resetPrismaMock();vi.mocked(assignTrip).mockClear();vi.mocked(dispatchCandidates).mockClear();mockPrisma.role.findMany.mockResolvedValue([{key:'admin',isSuperAdmin:false}]);mockPrisma.rolePermission.findMany.mockResolvedValue([{permission:{key:'trips.bookings:view'}},{permission:{key:'trips.bookings:edit'}}]);mockPrisma.booking.findMany.mockResolvedValue([]);mockPrisma.booking.count.mockResolvedValue(51);mockPrisma.booking.findFirst.mockResolvedValue({id});});
describe('scoped dispatch reads and mutations',()=>{
  it.each([['needs_assignment',{status:'requested',driverId:null}],['assigned',{driverId:{not:null},status:{in:['confirmed','on_the_way','arrived','in_progress','accepted','driver_arrived','ongoing']}}],['completed',{status:'completed'}]])('applies %s before pagination and counts the full result',async(quick,where)=>{
    const r=await request(app).get(`/workflow/dispatch?quick=${quick}&page=2&pageSize=25&search=Alice&sort=startsAt&direction=asc&from=2090-01-01&to=2090-01-02`).set('Authorization','Bearer '+token());
    expect(r.status).toBe(200);expect(r.body.meta).toMatchObject({total:51,page:2});
    const query=mockPrisma.booking.findMany.mock.calls[0][0];expect(query).toMatchObject({skip:25,take:25,orderBy:[{startsAt:'asc'},{id:'asc'}]});expect(query.where.AND).toContainEqual(where);expect(query.where.OR).toContainEqual({customerName:{contains:'Alice',mode:'insensitive'}});expect(mockPrisma.booking.count).toHaveBeenCalledWith({where:query.where});
  });
  it('retains custom-role ownership alongside quick filters',async()=>{
    mockPrisma.role.findMany.mockResolvedValue([{key:'custom_dispatch',isSuperAdmin:false}]);
    const r=await request(app).get('/workflow/dispatch?quick=needs_assignment').set('Authorization','Bearer '+token());expect(r.status).toBe(200);
    expect(mockPrisma.booking.findMany.mock.calls[0][0].where.AND).toContainEqual({createdByUserId:'staff'});
  });
  it('rejects invalid date ranges before reading bookings',async()=>{
    const r=await request(app).get('/workflow/dispatch?from=2090-02-30').set('Authorization','Bearer '+token());expect(r.status).toBe(422);expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
  });
  it('returns fresh detail and request/history timestamps with no-store',async()=>{
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue({id,driverId,updatedAt:'2026-10-08',offers:[],events:[]});
    const r=await request(app).get(`/workflow/dispatch/${id}`).set('Authorization','Bearer '+token());expect(r.status).toBe(200);expect(r.body.data.driverId).toBe(driverId);expect(r.headers['cache-control']).toContain('no-store');
  });
  it('distinguishes an unknown booking from an unregistered URL',async()=>{
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    const missingRecord=await request(app).get(`/workflow/dispatch/${id}`).set('Authorization','Bearer '+token());
    expect(missingRecord.status).toBe(404);expect(missingRecord.body.error).toMatchObject({code:'NOT_FOUND',message:'Booking not found'});
    expect(mockPrisma.booking.findUniqueOrThrow).not.toHaveBeenCalled();
    const missingRoute=await request(app).get(`/workflow/dispatch/${id}/missing-route`).set('Authorization','Bearer '+token());
    expect(missingRoute.status).toBe(404);expect(missingRoute.body.error.message).toBe(`No route for GET /workflow/dispatch/${id}/missing-route`);
  });
  it('denies detail without authentication or module view authority',async()=>{
    expect((await request(app).get(`/workflow/dispatch/${id}`)).status).toBe(401);
    mockPrisma.rolePermission.findMany.mockResolvedValue([]);
    expect((await request(app).get(`/workflow/dispatch/${id}`).set('Authorization','Bearer '+token())).status).toBe(403);
    expect(mockPrisma.booking.findFirst).not.toHaveBeenCalled();
  });
  it('hides another owner’s detail without reading its relations',async()=>{
    mockPrisma.role.findMany.mockResolvedValue([{key:'custom_dispatch',isSuperAdmin:false}]);mockPrisma.booking.findFirst.mockResolvedValue(null);
    const r=await request(app).get(`/workflow/dispatch/${id}`).set('Authorization','Bearer '+token());
    expect(r.status).toBe(404);expect(r.body.error.message).toBe('Booking not found');
    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith({where:{id,createdByUserId:'staff'}});
    expect(mockPrisma.booking.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('keeps candidate search paginated on the server',async()=>{
    const r=await request(app).get(`/workflow/dispatch/${id}/candidates?search=Alice&page=3&pageSize=10`).set('Authorization','Bearer '+token());expect(r.status).toBe(200);expect(dispatchCandidates).toHaveBeenCalledWith(id,{search:'Alice',page:3,pageSize:10});
  });
  it('denies read and mutation without the exact permissions',async()=>{
    mockPrisma.rolePermission.findMany.mockResolvedValue([]);
    expect((await request(app).get('/workflow/dispatch').set('Authorization','Bearer '+token())).status).toBe(403);
    expect((await request(app).post(`/workflow/dispatch/${id}/assign`).set('Authorization','Bearer '+token()).send({driverId,reason:'Denied'})).status).toBe(403);
    expect(assignTrip).not.toHaveBeenCalled();expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
  it('denies access to another owner before candidates or mutations',async()=>{
    mockPrisma.role.findMany.mockResolvedValue([{key:'custom_dispatch',isSuperAdmin:false}]);mockPrisma.booking.findFirst.mockResolvedValue(null);
    const r=await request(app).get(`/workflow/dispatch/${id}/candidates`).set('Authorization','Bearer '+token());expect(r.status).toBe(404);expect(dispatchCandidates).not.toHaveBeenCalled();
  });
  it('requires the displayed booking version and forwards it to the locked assignment service',async()=>{
    const body={driverId,reason:'Replacement requested',expectedDriverId:null,expectedUpdatedAt:'2026-10-08T00:00:00.000Z',clientRequestId:id};
    const missing=await request(app).post(`/workflow/dispatch/${id}/assign`).set('Authorization','Bearer '+token()).send({driverId,reason:'Missing version'});expect(missing.status).toBe(422);expect(assignTrip).not.toHaveBeenCalled();
    const r=await request(app).post(`/workflow/dispatch/${id}/assign`).set('Authorization','Bearer '+token()).send(body);expect(r.status).toBe(200);expect(assignTrip).toHaveBeenCalledWith(id,driverId,'staff',body.reason,undefined,{expectedDriverId:null,expectedUpdatedAt:body.expectedUpdatedAt,clientRequestId:id});
  });
});
