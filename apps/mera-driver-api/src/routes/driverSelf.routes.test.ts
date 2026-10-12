import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import { app } from '../app';
import { signAccessToken } from '../lib/jwt';

const OWN_DRIVER = { id: 'driver-1', userId: 'user-1', firstName: 'Ravi', documents: [] };
const OTHER_DRIVER_DOC = { id: 'doc-99', driverId: 'driver-2', category: 'personal', type: 'Aadhaar' };

function tokenFor(userId: string) {
  return signAccessToken({ sub: userId, roles: ['driver'], app: 'mera-driver' });
}

beforeEach(() => {
  resetPrismaMock();
});

describe('inline own DL verification ownership',()=>{
  it('denies anonymous history and check requests',async()=>{expect((await request(app).get('/drivers/me/dl-verification')).status).toBe(401);expect((await request(app).post('/drivers/me/dl-verification').send({})).status).toBe(401);});
  it('never uses browser-supplied driver IDs as ownership or accepts verification flags',async()=>{mockPrisma.driver.findUnique.mockResolvedValue({...OWN_DRIVER,dlNo:'UP5320260001705',dob:'2004-04-24'});mockPrisma.auditLog.findMany.mockResolvedValue([]);const res=await request(app).get('/drivers/me/dl-verification?driverId=other').set('Authorization',`Bearer ${tokenFor('user-1')}`);expect(res.status).toBe(200);expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.targetId).toBe('driver-1');const bad=await request(app).post('/drivers/me/dl-verification').set('Authorization',`Bearer ${tokenFor('user-1')}`).send({dlNo:'UP5320260001705',dob:'2004-04-24',status:'API verified',driverId:'other'});expect(bad.status).toBe(403);expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();});
  it('rejects a customer portal context even if a Driver ID is supplied',async()=>{const token=signAccessToken({sub:'customer',roles:['customer'],portalContext:'customer',app:'mera-driver'});expect((await request(app).get('/drivers/me/dl-verification?driverId=driver-1').set('Authorization',`Bearer ${token}`)).status).toBe(403);});
});

describe('GET /drivers/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/drivers/me');
    expect(res.status).toBe(401);
  });

  it('returns 404 DRIVER_NOT_LINKED when the caller has no linked Driver', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/drivers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DRIVER_NOT_LINKED');
  });

  it("returns the caller's own driver record, resolved from the JWT subject — never a param", async () => {
    // `driver.findUnique` is called twice: once by `resolveOwnDriver` (id-only select), once
    // by `getDriverById` inside the handler (full record) — both keyed off the same userId.
    mockPrisma.driver.findUnique
      .mockResolvedValueOnce({ id: 'driver-1' })
      .mockResolvedValueOnce(OWN_DRIVER);

    const res = await request(app).get('/drivers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('driver-1');
    expect(mockPrisma.driver.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });
});

describe('deactivated driver blocked from the self-service portal', () => {
  it('returns 403 DRIVER_DEACTIVATED instead of the driver record', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', accountStatus: 'Inactive' });

    const res = await request(app).get('/drivers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DRIVER_DEACTIVATED');
  });

  it('an active driver is unaffected', async () => {
    mockPrisma.driver.findUnique
      .mockResolvedValueOnce({ id: 'driver-1', accountStatus: 'Active' })
      .mockResolvedValueOnce(OWN_DRIVER);

    const res = await request(app).get('/drivers/me').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
  });
});

describe('PATCH /drivers/me', () => {
  beforeEach(() => {
    mockPrisma.driver.findUnique.mockResolvedValue(OWN_DRIVER);
    mockPrisma.driver.update.mockResolvedValue(OWN_DRIVER);
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('updates a self-editable field', async () => {
    const res = await request(app)
      .patch('/drivers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ firstName: 'Ravi Kumar' });

    expect(res.status).toBe(200);
    expect(mockPrisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'driver-1' }, data: expect.objectContaining({ firstName: 'Ravi Kumar' }) }),
    );
  });

  it('silently strips `status` — a driver cannot self-verify', async () => {
    await request(app)
      .patch('/drivers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ status: 'Verified', firstName: 'Ravi Kumar' });

    const callArg = mockPrisma.driver.update.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('status');
    expect(callArg.data.firstName).toBe('Ravi Kumar');
  });

  it('silently strips policeVerifiedStatus/policeVerifiedNo', async () => {
    await request(app)
      .patch('/drivers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ policeVerifiedStatus: 'Yes', policeVerifiedNo: 'FAKE-123' });

    const callArg = mockPrisma.driver.update.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty('policeVerifiedStatus');
    expect(callArg.data).not.toHaveProperty('policeVerifiedNo');
  });

  it('accepts a languages array', async () => {
    await request(app)
      .patch('/drivers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .send({ languages: ['Hindi', 'English'] });

    const callArg = mockPrisma.driver.update.mock.calls[0]?.[0];
    expect(callArg.data.languages).toEqual(['Hindi', 'English']);
  });
});

describe('driver document ownership', () => {
  it("GET /drivers/me/documents returns only the caller's own driver's documents", async () => {
    mockPrisma.driver.findUnique.mockResolvedValueOnce({ id: 'driver-1' }).mockResolvedValueOnce(OWN_DRIVER);
    mockPrisma.driverDocument.findMany.mockResolvedValue([]);

    const res = await request(app).get('/drivers/me/documents').set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.driverDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { driverId: 'driver-1' } }),
    );
  });

  it("DELETE /drivers/me/documents/:docId 404s on another driver's document (no existence leak)", async () => {
    mockPrisma.driver.findUnique.mockResolvedValue(OWN_DRIVER); // caller owns driver-1
    mockPrisma.driverDocument.findFirst.mockResolvedValue(null); // doc-99 belongs to driver-2, not driver-1

    const res = await request(app)
      .delete('/drivers/me/documents/doc-99')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(404);
    expect(mockPrisma.driverDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc-99', driverId: 'driver-1' } }),
    );
    expect(mockPrisma.driverDocument.delete).not.toHaveBeenCalled();
  });

  it('archives an owned document and preserves its original and review history', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue(OWN_DRIVER);
    mockPrisma.driverDocument.findFirst.mockResolvedValue({ id: 'doc-1', driverId: 'driver-1' });
    mockPrisma.driverDocument.delete.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});

    const res = await request(app)
      .delete('/drivers/me/documents/doc-1')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.driverDocument.update).toHaveBeenCalledWith({ where: { id: 'doc-1' }, data: { archivedAt: expect.any(Date) } });
    expect(mockPrisma.driverDocument.delete).not.toHaveBeenCalled();
    expect(mockPrisma.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { status: 'Non-Verified' } });
  });
});

describe('driver A cannot reach driver B via any /drivers/me* route', () => {
  it('driverId always comes from the mocked JWT subject, never accepted from the client', async () => {
    // Driver A's token (user-1) resolves to driver-1 no matter what path/body is sent —
    // there is no `:id` param anywhere under /drivers/me for a client to manipulate.
    mockPrisma.driver.findUnique.mockResolvedValueOnce({ id: 'driver-1' }).mockResolvedValueOnce(OWN_DRIVER);

    const res = await request(app)
      .get('/drivers/me')
      .set('Authorization', `Bearer ${tokenFor('user-1')}`)
      .query({ driverId: 'driver-2', id: 'driver-2' }); // attempted manipulation — ignored

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('driver-1');
    expect(mockPrisma.driver.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });
});


describe('owned professional resume',()=>{
  it('ignores another driver id in query and resolves the preview from the caller login',async()=>{
    mockPrisma.driver.findUnique.mockResolvedValue(OWN_DRIVER);const response=await request(app).get('/drivers/me/resume?driverId=driver-2').set('Authorization',`Bearer ${tokenFor('user-1')}`);expect(response.status).toBe(200);expect(response.body.data.data.name).toBe('Ravi');expect(mockPrisma.driver.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({where:{id:'driver-1'}}));
  });
  it('cannot request another driver resume through the staff route',async()=>{mockPrisma.role.findMany.mockResolvedValue([]);mockPrisma.rolePermission.findMany.mockResolvedValue([]);const response=await request(app).get('/drivers/driver-2/resume').set('Authorization',`Bearer ${tokenFor('user-1')}`);expect(response.status).toBe(403);});
});

it.each(['/drivers/me','/drivers/me/documents','/drivers/me/resume.pdf'])('denies an existing driver session when its User account is blocked: %s',async path=>{mockPrisma.driver.findUnique.mockResolvedValue({...OWN_DRIVER,accountStatus:'Active',user:{status:'blocked',deletedAt:null}});const result=await request(app).get(path).set('Authorization',`Bearer ${tokenFor('user-1')}`);expect(result.status).toBe(403);expect(result.body.error.code).toBe('ACCOUNT_INACTIVE');expect(mockPrisma.driverDocument.findMany).not.toHaveBeenCalled();});
