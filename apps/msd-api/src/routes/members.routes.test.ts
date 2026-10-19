import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../services/permission-resolver.service', () => ({ resolveGrantedPermissionKeys: vi.fn() }));
vi.mock('../services/member-notice.service', () => ({
  sendMemberNotice: vi.fn().mockResolvedValue({ email: true, sms: true }),
}));

import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { createApp } from '../app';
import { bearerFor } from '../test-utils/auth-test-utils';

const prismaMock = vi.mocked(prisma, true);
const grants = vi.mocked(resolveGrantedPermissionKeys);
const app = createApp();

const MEMBER_ID = 'b1b1b1b1-0000-4000-8000-000000000001';
const OWNER_ID = 'a1a1a1a1-0000-4000-8000-000000000002';
const MEMBER_ROW = {
  id: MEMBER_ID,
  status: 'ACTIVE',
  statusReason: null,
  ownerUserId: OWNER_ID,
  businessName: 'Glow',
  owner: { name: 'A', email: 'a@x.com', phone: '+919876543210', roles: [] },
  documents: [],
  mediaImages: [],
  mediaVideo: null,
  _count: {},
};
const CREATE_BODY = {
  businessName: 'Glow Studio',
  ownerFirstName: 'Asha',
  ownerLastName: 'Rao',
  ownerEmail: 'asha@glow.test',
  ownerMobile: '9876543210',
};
const REASON = 'Documents not completed';
const ADMIN = bearerFor({ sub: 'admin-1', roles: ['admin'] });

function armCreate() {
  prismaMock.user.findFirst.mockResolvedValue(null);
  prismaMock.user.create.mockResolvedValue({ id: 'u1' });
  prismaMock.role.findUnique.mockResolvedValue({ id: 'r-member', key: 'member' });
  prismaMock.userRole.upsert.mockResolvedValue({});
  prismaMock.member.findUnique.mockResolvedValue(null);
  prismaMock.member.update.mockResolvedValue({});
  prismaMock.member.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: MEMBER_ID,
    owner: { id: 'u1', name: 'Asha Rao', email: CREATE_BODY.ownerEmail, phone: '+919876543210', status: 'active', roles: [] },
    documents: [],
    mediaImages: [],
    mediaVideo: null,
    _count: { branches: 0, deals: 0, products: 0, therapists: 0 },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.member.findUnique.mockResolvedValue(MEMBER_ROW);
  for (const model of [prismaMock.branch, prismaMock.deal, prismaMock.product, prismaMock.therapist]) {
    model.groupBy.mockResolvedValue([]);
  }
});

describe('/api/v1/members authentication', () => {
  it('401 without a token', async () => {
    const res = await request(app).get('/api/v1/members');
    expect(res.status).toBe(401);
  });

  it('422 for an id that is not a uuid', async () => {
    grants.mockResolvedValue(['members:view']);
    const res = await request(app).get('/api/v1/members/not-a-uuid').set('Authorization', ADMIN);
    expect(res.status).toBe(422);
  });
});

describe('/api/v1/members permission gates', () => {
  const base = `/api/v1/members/${MEMBER_ID}`;
  it.each([
    ['view', 'get', '/api/v1/members', undefined],
    ['view', 'get', base, undefined],
    ['create', 'post', '/api/v1/members', CREATE_BODY],
    ['edit', 'patch', base, { businessName: 'New name' }],
    ['status_change', 'patch', `${base}/status`, { status: 'SUSPENDED', reason: REASON }],
    ['delete', 'delete', base, { reason: REASON }],
    ['approve', 'patch', `${base}/documents/PAN/review`, { decision: 'APPROVED' }],
    ['reject', 'patch', `${base}/documents/PAN/review`, { decision: 'REJECTED', reason: REASON }],
  ] as const)('403 without members:%s on %s %s', async (action, method, path, body) => {
    // Every other members action is granted, so only the missing one can cause the 403.
    const all = ['view', 'create', 'edit', 'status_change', 'delete', 'approve', 'reject'];
    grants.mockResolvedValue(all.filter((a) => a !== action).map((a) => `members:${a}`));
    const req = request(app)[method](path).set('Authorization', ADMIN);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/v1/members', () => {
  it('201 creates an ACTIVE member with the member role and writes an audit row', async () => {
    grants.mockResolvedValue(['members:create']);
    armCreate();
    const res = await request(app).post('/api/v1/members').set('Authorization', ADMIN).send(CREATE_BODY);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: MEMBER_ID, status: 'ACTIVE', businessName: 'Glow Studio' });
    expect(prismaMock.role.findUnique).toHaveBeenCalledWith({ where: { key: 'member' } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'member.created', targetId: MEMBER_ID }),
    });
    expect(res.headers.deprecation).toBeUndefined();
  });

  it('409 names the field that is already taken', async () => {
    grants.mockResolvedValue(['members:create']);
    armCreate();
    prismaMock.user.findFirst.mockResolvedValueOnce({ id: 'x' }).mockResolvedValueOnce(null);
    const res = await request(app).post('/api/v1/members').set('Authorization', ADMIN).send(CREATE_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error.details.fields).toHaveProperty('ownerEmail');
    expect(res.body.error.details.fields).not.toHaveProperty('ownerMobile');
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it('sorts the list by an allowlisted field with a stable tie-break', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.member.count.mockResolvedValue(0);
    const res = await request(app).get('/api/v1/members?sort=businessName&dir=desc').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(prismaMock.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ businessName: 'desc' }, { id: 'asc' }] }),
    );
  });

  it('422 for a sort field outside the allowlist', async () => {
    grants.mockResolvedValue(['members:view']);
    const res = await request(app).get('/api/v1/members?sort=ownerMobile').set('Authorization', ADMIN);
    expect(res.status).toBe(422);
  });

  it('422 for a field outside the allowlist', async () => {
    grants.mockResolvedValue(['members:create']);
    const res = await request(app)
      .post('/api/v1/members')
      .set('Authorization', ADMIN)
      .send({ ...CREATE_BODY, status: 'SUSPENDED' });
    expect(res.status).toBe(422);
  });
});

describe('PATCH /api/v1/members/:id/status', () => {
  it('422 when the reason is shorter than 10 characters', async () => {
    grants.mockResolvedValue(['members:status_change']);
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', ADMIN)
      .send({ status: 'SUSPENDED', reason: 'short' });
    expect(res.status).toBe(422);
    expect(prismaMock.member.updateMany).not.toHaveBeenCalled();
  });

  it('200 and a history row for an admin', async () => {
    grants.mockResolvedValue(['members:status_change', 'members:view']);
    prismaMock.member.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.memberStatusHistory.create.mockResolvedValue({});
    prismaMock.refreshSession.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.member.findUnique
      .mockResolvedValueOnce(MEMBER_ROW)
      .mockResolvedValue({ ...MEMBER_ROW, status: 'SUSPENDED' });
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', ADMIN)
      .send({ status: 'SUSPENDED', reason: REASON });
    expect(res.body.error ?? null).toBeNull();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUSPENDED');
    expect(prismaMock.memberStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ memberId: MEMBER_ID, fromStatus: 'ACTIVE', toStatus: 'SUSPENDED' }),
    });
  });

  it('409 for a transition the status machine refuses', async () => {
    grants.mockResolvedValue(['members:status_change']);
    prismaMock.member.findUnique.mockResolvedValue({ ...MEMBER_ROW, status: 'SUSPENDED' });
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', ADMIN)
      .send({ status: 'INACTIVE', reason: REASON });
    expect(res.status).toBe(409);
    expect(prismaMock.memberStatusHistory.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/members/:id', () => {
  it('409 MEMBER_NOT_SUSPENDED when the member is still active', async () => {
    grants.mockResolvedValue(['members:delete']);
    const res = await request(app)
      .delete(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', bearerFor({ sub: 'sa-1', roles: ['super_admin'] }))
      .send({ reason: 'Cleanup after suspension' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBER_NOT_SUSPENDED');
    expect(prismaMock.member.delete).not.toHaveBeenCalled();
  });

  it('422 without a reason', async () => {
    grants.mockResolvedValue(['members:delete']);
    const res = await request(app)
      .delete(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', bearerFor({ sub: 'sa-1', roles: ['super_admin'] }));
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/members/:id/documents', () => {
  const row = {
    id: 'doc-1',
    vendorId: MEMBER_ID,
    documentType: 'PAN',
    status: 'SUBMITTED',
    numberMasked: 'ABXXXXX34F',
    numberHash: 'h',
    numberEncrypted: 'c',
    storageKey: 'vendor-documents/x/pan.pdf',
    originalFilename: 'pan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
  };

  it('hides file fields from a viewer with members:view only', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.memberDocument.findMany.mockResolvedValue([row]);
    const res = await request(app)
      .get(`/api/v1/members/${MEMBER_ID}/documents`)
      .set('Authorization', bearerFor({ sub: 'support-1', roles: ['support'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ documentType: 'PAN', status: 'SUBMITTED' });
    expect(res.body.data[0]).not.toHaveProperty('numberMasked');
    expect(res.body.data[0]).not.toHaveProperty('storageKey');
    expect(res.body.data[0]).not.toHaveProperty('numberHash');
  });

  it('includes file fields for members:approve', async () => {
    grants.mockResolvedValue(['members:view', 'members:approve']);
    prismaMock.memberDocument.findMany.mockResolvedValue([row]);
    const res = await request(app).get(`/api/v1/members/${MEMBER_ID}/documents`).set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data[0].storageKey).toBe(row.storageKey);
    expect(res.body.data[0]).not.toHaveProperty('numberEncrypted');
  });
});

/** Full MemberDocument rows, as a careless `documents: true` include would return them. */
const FULL_DOCS = [
  {
    id: 'doc-1',
    vendorId: MEMBER_ID,
    documentType: 'PAN',
    status: 'SUBMITTED',
    numberMasked: 'ABXXXXX34F',
    numberHash: 'secret-hash',
    numberEncrypted: 'secret-cipher',
    storageKey: 'vendor-documents/secret/pan.pdf',
    originalFilename: 'my-pan.pdf',
  },
];
const LEAKY_ROW = { ...MEMBER_ROW, documents: FULL_DOCS };
const SENSITIVE = ['numberHash', 'numberEncrypted', 'storageKey', 'originalFilename', 'secret-hash', 'secret-cipher', 'my-pan.pdf', 'ABXXXXX34F'];

function expectNoDocumentSecrets(body: unknown) {
  const json = JSON.stringify(body);
  for (const needle of SENSITIVE) expect(json).not.toContain(needle);
}

describe('member responses never carry document secrets', () => {
  it('GET /members selects only safe document fields and leaks none', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([LEAKY_ROW]);
    prismaMock.member.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v1/members').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expectNoDocumentSecrets(res.body);
    expect(res.body.data[0].documentsSummary).toBeDefined();
    const include = prismaMock.member.findMany.mock.calls[0][0].include;
    expect(include.documents).toEqual({ select: { id: true, documentType: true, status: true } });
  });

  it('GET /members/:id leaks nothing to a members:view only viewer', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.member.findUnique.mockResolvedValue(LEAKY_ROW);
    const res = await request(app)
      .get(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', bearerFor({ sub: 'support-1', roles: ['support'] }));
    expect(res.status).toBe(200);
    expectNoDocumentSecrets(res.body);
    expect(res.body.data.documents).toEqual([{ id: 'doc-1', documentType: 'PAN', status: 'SUBMITTED' }]);
    expect(res.body.data.profileCompletion.sections.find((s: { key: string }) => s.key === 'kyc').complete).toBe(true);
  });

  it('PATCH /members/:id leaks nothing', async () => {
    grants.mockResolvedValue(['members:edit']);
    prismaMock.member.findUnique.mockResolvedValue(LEAKY_ROW);
    prismaMock.member.update.mockResolvedValue({ ...LEAKY_ROW, businessName: 'New name' });
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', ADMIN)
      .send({ businessName: 'New name' });
    expect(res.status).toBe(200);
    expectNoDocumentSecrets(res.body);
  });

  it('GET /vendors/me leaks nothing', async () => {
    grants.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(LEAKY_ROW);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: OWNER_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
    expectNoDocumentSecrets(res.body);
  });
});

describe('member update audit rows record the changed input only', () => {
  it('PATCH /members/:id audits exactly the validated body', async () => {
    grants.mockResolvedValue(['members:edit']);
    prismaMock.member.findUnique.mockResolvedValue(LEAKY_ROW);
    prismaMock.member.update.mockResolvedValue({ ...LEAKY_ROW, businessName: 'New name' });
    const body = { businessName: 'New name', city: 'Pune' };
    await request(app).patch(`/api/v1/members/${MEMBER_ID}`).set('Authorization', ADMIN).send(body);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'member.updated', after: body }),
    });
    expectNoDocumentSecrets(prismaMock.auditLog.create.mock.calls[0][0]);
  });

  it('PATCH /vendors/me audits exactly the validated body', async () => {
    grants.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(LEAKY_ROW);
    prismaMock.member.update.mockResolvedValue({ ...LEAKY_ROW, city: 'Pune' });
    const body = { city: 'Pune' };
    const res = await request(app)
      .patch('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: OWNER_ID, roles: ['member'] }))
      .send(body);
    expect(res.status).toBe(200);
    expectNoDocumentSecrets(res.body);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'vendor.self_update', after: body }),
    });
  });
});

describe('PATCH /api/v1/members/:id accepts only allowlisted fields', () => {
  it.each([
    ['ownerUserId', { ownerUserId: OWNER_ID }],
    ['kycDocuments', { kycDocuments: [] }],
    ['an unknown key', { businessName: 'X', status: 'SUSPENDED' }],
  ])('422 for %s', async (_label, body) => {
    grants.mockResolvedValue(['members:edit']);
    const res = await request(app).patch(`/api/v1/members/${MEMBER_ID}`).set('Authorization', ADMIN).send(body);
    expect(res.status).toBe(422);
    expect(prismaMock.member.update).not.toHaveBeenCalled();
  });

  it('422 for an unknown key on the status change and review bodies', async () => {
    grants.mockResolvedValue(['members:status_change', 'members:approve', 'members:reject']);
    const status = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', ADMIN)
      .send({ status: 'SUSPENDED', reason: REASON, extra: 1 });
    expect(status.status).toBe(422);
    const review = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}/documents/PAN/review`)
      .set('Authorization', ADMIN)
      .send({ decision: 'APPROVED', extra: 1 });
    expect(review.status).toBe(422);
  });
});

describe('PATCH /api/v1/members/:id/documents/:type/review gate order', () => {
  it('403, not 422, for a caller without approve or reject sending an invalid body', async () => {
    grants.mockResolvedValue(['members:view']);
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}/documents/PAN/review`)
      .set('Authorization', ADMIN)
      .send({ decision: 'MAYBE' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('422 for an invalid body from a caller holding members:reject only', async () => {
    grants.mockResolvedValue(['members:reject']);
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}/documents/PAN/review`)
      .set('Authorization', ADMIN)
      .send({ decision: 'MAYBE' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/members/:id/documents number masking', () => {
  it('a members:view only viewer gets type and status but no masked number', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.memberDocument.findMany.mockResolvedValue(FULL_DOCS);
    const res = await request(app)
      .get(`/api/v1/members/${MEMBER_ID}/documents`)
      .set('Authorization', bearerFor({ sub: 'support-1', roles: ['support'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ documentType: 'PAN', status: 'SUBMITTED' });
    expect(res.body.data[0]).not.toHaveProperty('numberMasked');
  });

  it('members:edit sees the masked number', async () => {
    grants.mockResolvedValue(['members:view', 'members:edit']);
    prismaMock.memberDocument.findMany.mockResolvedValue(FULL_DOCS);
    const res = await request(app).get(`/api/v1/members/${MEMBER_ID}/documents`).set('Authorization', ADMIN);
    expect(res.body.data[0].numberMasked).toBe('ABXXXXX34F');
  });
});

describe('legacy /vendors alias', () => {
  it('serves GET /api/v1/vendors with Deprecation and Link headers', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.member.count.mockResolvedValue(0);
    const res = await request(app).get('/api/v1/vendors').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toBe('</api/v1/members>; rel="successor-version"');
  });

  it('the canonical GET /api/v1/members carries no Deprecation header', async () => {
    grants.mockResolvedValue(['members:view']);
    prismaMock.member.findMany.mockResolvedValue([]);
    prismaMock.member.count.mockResolvedValue(0);
    const res = await request(app).get('/api/v1/members').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBeUndefined();
    expect(res.headers.link).toBeUndefined();
  });

  it('POST /api/v1/vendors goes through createMember', async () => {
    grants.mockResolvedValue(['members:create']);
    armCreate();
    const res = await request(app).post('/api/v1/vendors').set('Authorization', ADMIN).send(CREATE_BODY);
    expect(res.status).toBe(201);
    expect(res.headers.deprecation).toBe('true');
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.role.findUnique).toHaveBeenCalledWith({ where: { key: 'member' } });
  });

  it('GET /api/v1/vendors/me reaches the self-service route, not /:id', async () => {
    grants.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(MEMBER_ROW);
    const res = await request(app)
      .get('/api/v1/vendors/me')
      .set('Authorization', bearerFor({ sub: OWNER_ID, roles: ['member'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(MEMBER_ID);
    expect(res.headers.deprecation).toBeUndefined();
    expect(prismaMock.member.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: OWNER_ID } }),
    );
  });
});
