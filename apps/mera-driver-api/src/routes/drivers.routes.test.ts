import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { app } from '../app';
import { signAccessToken } from '../lib/jwt';
import { invalidatePermissionCache } from '../services/permission.service';

const USER_2_ID = '22222222-2222-2222-8222-222222222222';

function adminToken() {
  return signAccessToken({ sub: 'admin-1', roles: ['admin'], app: 'mera-driver' });
}

function grant(...keys: string[]) {
  mockPrisma.role.findMany.mockResolvedValue([{ isSuperAdmin: false }]);
  mockPrisma.rolePermission.findMany.mockResolvedValue(keys.map((key) => ({ permission: { key } })));
}

beforeEach(() => {
  resetPrismaMock();
  invalidatePermissionCache();
});

describe('read-only Driver Details and resume authorization',()=>{
  it.each(['/drivers/driver-1/details','/drivers/driver-1/resume.pdf'])('denies anonymous requests: %s',async(url)=>{expect((await request(app).get(url)).status).toBe(401);});
  it.each(['driver','customer','kyc_verification'])('does not grant general staff details/export to a portal or verifier role: %s',async(role)=>{
    grant('kyc-assignments:view');const token=signAccessToken({sub:'portal-1',roles:[role],app:'mera-driver'});
    for(const suffix of ['details','resume.pdf'])expect((await request(app).get(`/drivers/driver-1/${suffix}`).set('Authorization',`Bearer ${token}`)).status).toBe(403);
  });
  it('requires export independently of drivers:view',async()=>{grant('drivers:view');expect((await request(app).get('/drivers/driver-1/resume.pdf').set('Authorization',`Bearer ${adminToken()}`)).status).toBe(403);});
});

describe('explicit final KYC approval',()=>{
  it('does not give customer/driver roles staff inline DL check or history access',async()=>{for(const role of ['customer','driver']){const token=signAccessToken({sub:'portal',roles:[role],app:'mera-driver'});expect((await request(app).get('/drivers/other/dl-verification').set('Authorization',`Bearer ${token}`)).status).toBe(403);expect((await request(app).post('/drivers/other/dl-verification').set('Authorization',`Bearer ${token}`).send({dlNo:'UP5320260001705',dob:'2004-04-24'})).status).toBe(403);}});
  it('denies a verifier without drivers:edit',async()=>{grant('kyc-assignments:view');const res=await request(app).post('/drivers/driver-1/kyc-approval').set('Authorization',`Bearer ${adminToken()}`).send({});expect(res.status).toBe(403);expect(mockPrisma.driver.update).not.toHaveBeenCalled();});
  it('keeps premature approval guarded independently of onboarding saves',async()=>{grant('drivers:edit');mockPrisma.driver.findUnique.mockResolvedValue({id:'driver-1',status:'Non-Verified',completedSubSteps:[],documents:[]});mockPrisma.driverKycCheck.findMany.mockResolvedValue([]);const res=await request(app).post('/drivers/driver-1/kyc-approval').set('Authorization',`Bearer ${adminToken()}`).send({});expect(res.status).toBe(422);expect(res.body.error.code).toBe('KYC_REVIEW_REQUIRED');expect(mockPrisma.driver.update).not.toHaveBeenCalled();});
});

describe('PATCH /drivers/:id/link-user', () => {
  it('returns 403 without drivers:assign', async () => {
    grant('drivers:view');
    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: '11111111-1111-1111-8111-111111111111' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the target user does not exist', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: '11111111-1111-1111-8111-111111111111' });

    expect(res.status).toBe(404);
  });

  it('links the driver, auto-assigns the driver role, and audit-logs it', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_2_ID, deletedAt: null,roles:[{role:{key:'kyc_verification'}}] });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-driver', key: 'driver' });
    mockPrisma.userRole.upsert.mockResolvedValue({});
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: USER_2_ID });

    expect(res.status).toBe(200);
    expect(mockPrisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_roleId: { userId: USER_2_ID, roleId: 'role-driver' } } }),
    );
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { userId: USER_2_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'driver.link' }) }),
    );
  });

  it('surfaces the unique-constraint violation as a clean 409 when the user is already linked to a driver', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_2_ID, deletedAt: null,roles:[{role:{key:'kyc_verification'}}] });
    mockPrisma.role.findUnique.mockResolvedValue(null); // no driver role row in this scenario — irrelevant to the conflict
    const { Prisma } = await import('../generated/prisma-client');
    mockPrisma.driver.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['userId'] },
      }),
    );

    const res = await request(app)
      .patch('/drivers/driver-1/link-user')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ userId: USER_2_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('PATCH /drivers/:id/status', () => {
  it('returns 403 without drivers:status_change', async () => {
    grant('drivers:edit');
    const res = await request(app)
      .patch('/drivers/driver-1/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ accountStatus: 'Inactive' });
    expect(res.status).toBe(403);
  });

  it('returns 422 for an invalid accountStatus value', async () => {
    grant('drivers:status_change');
    const res = await request(app)
      .patch('/drivers/driver-1/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ accountStatus: 'Unknown' });
    expect(res.status).toBe(422);
  });

  it('returns 404 for a nonexistent driver', async () => {
    grant('drivers:status_change');
    mockPrisma.driver.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch('/drivers/missing/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ accountStatus: 'Inactive' });
    expect(res.status).toBe(404);
  });

  it('deactivates the driver and audit-logs it', async () => {
    grant('drivers:status_change');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', accountStatus: 'Inactive', documents: [] });
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ accountStatus: 'Inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe('Inactive');
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { accountStatus: 'Inactive' } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'driver.status_change' }) }),
    );
  });

  it('reactivates the driver', async () => {
    grant('drivers:status_change');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', accountStatus: 'Active', documents: [] });
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/status')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ accountStatus: 'Active' });

    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe('Active');
  });
});

describe('PATCH /drivers/:id/unlink-user', () => {
  it('clears the link and audit-logs it', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/unlink-user')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { userId: null } });
  });
});

describe('POST /drivers/:id/create-user', () => {
  it('returns 403 without drivers:assign', async () => {
    grant('drivers:view');
    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('creates a User, assigns the driver role, links it, and audit-logs it', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: null,
      firstName: 'Ravi',
      lastName: 'Kumar',
      phone: '9000000000',
      email: null,
      documents: [],
    });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-driver', key: 'driver' });
    mockPrisma.user.create.mockResolvedValue({ id: USER_2_ID });
    mockPrisma.userRole.create.mockResolvedValue({});
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Ravi Kumar', email: undefined, phone: '+919000000000' },
    });
    expect(mockPrisma.userRole.create).toHaveBeenCalledWith({ data: { userId: USER_2_ID, roleId: 'role-driver' } });
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { userId: USER_2_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'driver.user.create' }) }),
    );
  });

  it('returns 409 without creating anything when the driver is already linked', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', userId: USER_2_ID, documents: [] });

    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(409);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('returns 422 when the driver has neither phone nor email', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', userId: null, phone: null, email: null, documents: [] });

    const res = await request(app).post('/drivers/driver-1/create-user').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(422);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});

function verifierToken(sub: string) {
  return signAccessToken({ sub, roles: ['kyc_verification'], app: 'mera-driver' });
}

describe('GET /drivers/available', () => {
  it('returns 403 without trips.bookings:view', async () => {
    grant('drivers:view');
    const res = await request(app).get('/drivers/available').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns the safe projection for a caller with trips.bookings:view', async () => {
    grant('trips.bookings:view');
    mockPrisma.driver.findMany.mockResolvedValue([{ id: 'driver-1', firstName: 'Amit' }]);

    const res = await request(app).get('/drivers/available').set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'Verified', accountStatus: 'Active' } }),
    );
  });
});

describe('PATCH /drivers/:id/assign-verifier', () => {
  it('returns 403 without drivers:assign', async () => {
    grant('drivers:view');
    const res = await request(app)
      .patch('/drivers/driver-1/assign-verifier')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ verifierId: '11111111-1111-1111-8111-111111111111' });
    expect(res.status).toBe(403);
  });

  it('assigns a verifier and audit-logs it', async () => {
    grant('drivers:assign','kyc-assignments:view');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', assignedVerifierId: USER_2_ID, documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_2_ID, deletedAt: null,roles:[{role:{key:'kyc_verification'}}] });
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/assign-verifier')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ verifierId: USER_2_ID });

    expect(res.status).toBe(200);
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { assignedVerifierId: USER_2_ID } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'driver.kyc.assign' }) }),
    );
  });

  it('returns 404 when the target verifier does not exist', async () => {
    grant('drivers:assign');
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', documents: [] });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/drivers/driver-1/assign-verifier')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ verifierId: USER_2_ID });

    expect(res.status).toBe(404);
  });
});

describe('GET /drivers/assigned-to-me', () => {
  it('returns 403 without kyc-assignments:view', async () => {
    grant('drivers:view');
    const res = await request(app).get('/drivers/assigned-to-me').set('Authorization', `Bearer ${verifierToken('verifier-1')}`);
    expect(res.status).toBe(403);
  });

  it("scopes the query to the caller's own userId", async () => {
    grant('kyc-assignments:view');
    mockPrisma.driver.findMany.mockResolvedValue([{ id: 'driver-1' }]);

    const res = await request(app).get('/drivers/assigned-to-me').set('Authorization', `Bearer ${verifierToken('verifier-1')}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: expect.arrayContaining([{ assignedVerifierId: 'verifier-1' }]) }, take: 25 }),
    );
  });
});

describe('GET /drivers/assigned-to-me/:id — permission plus assignment', () => {
  beforeEach(() => grant('kyc-assignments:view'));

  it('returns the driver when assigned to the caller', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue({ id: 'driver-1', assignedVerifierId: 'verifier-1' });

    const res = await request(app)
      .get('/drivers/assigned-to-me/driver-1')
      .set('Authorization', `Bearer ${verifierToken('verifier-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('driver-1');
  });

  it("returns 404 for a driver assigned to a different verifier (verifier A cannot reach verifier B's driver)", async () => {
    mockPrisma.driver.findFirst.mockResolvedValue(null); // driver-1 is assigned to verifier-2, not verifier-1

    const res = await request(app)
      .get('/drivers/assigned-to-me/driver-1')
      .set('Authorization', `Bearer ${verifierToken('verifier-1')}`);

    expect(res.status).toBe(404);
    expect(mockPrisma.driver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'driver-1', assignedVerifierId: 'verifier-1' } }),
    );
  });
});

describe('PATCH /drivers/:id/kyc-checklist — permission plus assignment', () => {
  beforeEach(() => grant('kyc-assignments:view'));

  it('updates a checklist category for the assigned verifier', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue({ id: 'driver-1', assignedVerifierId: 'verifier-1' });
    mockPrisma.driver.update.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .patch('/drivers/driver-1/kyc-checklist')
      .set('Authorization', `Bearer ${verifierToken('verifier-1')}`)
      .send({ category: 'personal', status: 'Verified' });

    expect(res.status).toBe(200);
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { personalDocsStatus: 'Verified', personalDocsNotes: null },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'driver.kyc.checklist_update' }) }),
    );
  });

  it('returns 404 and writes nothing for a driver not assigned to the caller', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/drivers/driver-1/kyc-checklist')
      .set('Authorization', `Bearer ${verifierToken('someone-else')}`)
      .send({ category: 'personal', status: 'Verified' });

    expect(res.status).toBe(404);
    expect(mockPrisma.driver.update).not.toHaveBeenCalled();
  });

  it('returns 422 for an invalid category value', async () => {
    mockPrisma.driver.findFirst.mockResolvedValue({ id: 'driver-1', assignedVerifierId: 'verifier-1' });

    const res = await request(app)
      .patch('/drivers/driver-1/kyc-checklist')
      .set('Authorization', `Bearer ${verifierToken('verifier-1')}`)
      .send({ category: 'vehicle', status: 'Verified' });

    expect(res.status).toBe(422);
  });
});


describe('professional resume permissions',()=>{
  it('allows a staff preview without requiring internal-report export',async()=>{grant('drivers:view');mockPrisma.driver.findUnique.mockResolvedValue({id:'driver-1',firstName:'Saved',documents:[]});const response=await request(app).get('/drivers/driver-1/resume').set('Authorization',`Bearer ${adminToken()}`);expect(response.status).toBe(200);expect(response.body.data.filename).toBe('Saved_Driver_Resume.pdf');});
  it('denies resume edits to view-only staff and KYC verifiers',async()=>{grant('drivers:view','kyc-assignments:view');const response=await request(app).patch('/drivers/driver-1/resume').set('Authorization',`Bearer ${adminToken()}`).send({});expect(response.status).toBe(403);expect(mockPrisma.driver.update).not.toHaveBeenCalled();});
});

describe('administrative KYC assignment queue',()=>{
 it('grants full paginated queue through drivers:assign while maintaining the state/search predicates',async()=>{grant('kyc-assignments:view','drivers:assign');mockPrisma.driver.findMany.mockResolvedValue([{id:'unassigned',assignedVerifierId:null}]);mockPrisma.driver.count.mockResolvedValue(1);const res=await request(app).get('/drivers/assigned-to-me?page=2&state=Unassigned&search=Ravi').set('Authorization',`Bearer ${adminToken()}`);expect(res.status).toBe(200);expect(res.body.meta).toMatchObject({page:2,total:1});const query=mockPrisma.driver.findMany.mock.calls[0][0];expect(query.skip).toBe(25);expect(query.where.AND[0]).toEqual({});expect(query.where.AND[2].assignedVerifierId).toBeNull();});
 it('requires a reason before changing an existing assignment',async()=>{grant('drivers:assign');mockPrisma.driver.findUnique.mockResolvedValue({id:'driver-1',assignedVerifierId:'previous',documents:[]});const res=await request(app).patch('/drivers/driver-1/assign-verifier').set('Authorization',`Bearer ${adminToken()}`).send({verifierId:USER_2_ID});expect(res.status).toBe(422);expect(mockPrisma.driver.update).not.toHaveBeenCalled();});
});

describe('assigned review DL execution',()=>{
 it('denies ordinary profile editors from using the retired form action',async()=>{grant('drivers:edit');const r=await request(app).post('/drivers/driver-1/dl-verification').set('Authorization',`Bearer ${adminToken()}`).send({});expect(r.status).toBe(403);expect(r.body.error.code).toBe('DL_REVIEW_REQUIRED');expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();});
 it('requires the reviewer assignment rather than browser DL/DOB or driver identity',async()=>{grant('kyc-assignments:view');mockPrisma.driver.findFirst.mockResolvedValue(null);const r=await request(app).post('/drivers/driver-1/dl-verification/preflight').set('Authorization',`Bearer ${adminToken()}`).send({});expect(r.status).toBe(404);expect(mockPrisma.driver.findFirst).toHaveBeenCalledWith({where:{id:'driver-1',assignedVerifierId:'admin-1'}});expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();});
 it('uses the existing explicit administrative policy without inventing role privileges',async()=>{grant('kyc-assignments:view','drivers:assign');mockPrisma.driver.findFirst.mockResolvedValue(null);const r=await request(app).post('/drivers/driver-1/dl-verification/preflight').set('Authorization',`Bearer ${adminToken()}`).send({});expect(r.status).toBe(404);expect(mockPrisma.driver.findFirst).toHaveBeenCalledWith({where:{id:'driver-1'}});});
});
