import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
}));

vi.mock('../lib/media-storage', () => ({
  writeMediaFile: vi.fn(async (subdir: string, parentId: string, buffer: Buffer) => ({
    storageKey: `${subdir}/${parentId}/fake.pdf`,
    sizeBytes: buffer.length,
  })),
  deleteMediaFile: vi.fn(async () => undefined),
}));

import app from '../app';
import { prisma } from '../lib/prisma';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);
const prismaMock = vi.mocked(prisma, true);

const USER_A_ID = 'a0a0a0a0-0000-4000-8000-000000000001';
const VENDOR_A_ID = 'b0b0b0b0-0000-4000-8000-000000000002';

const vendorAFixture = { id: VENDOR_A_ID, ownerUserId: USER_A_ID, businessName: 'Vendor A Spa', status: 'ACTIVE', kycStatus: 'PENDING' };
const documentFixture = { id: 'doc-1', vendorId: VENDOR_A_ID, documentType: 'GST', storageKey: 'vendor-documents/x/fake.pdf', originalFilename: 'gst.pdf', mimeType: 'application/pdf', sizeBytes: 1024 };

/** A byte-exact, magic-byte-valid PDF buffer — `%PDF-` header, well under the 5MB ceiling. */
function validPdf(): Buffer {
  return Buffer.from('%PDF-1.4\n%mock pdf content for testing\n');
}

function invalidFile(): Buffer {
  return Buffer.from('not a real document');
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

/**
 * Feature: real KYC document file upload (GST/PAN/Aadhaar) — replaces the deprecated pasted-URL
 * `kycDocuments` shape. Self-service (`/vendors/me/kyc-documents/:documentType`) and
 * admin-on-behalf (`/vendors/:id/kyc-documents/:documentType`) both upsert by `(vendorId,
 * documentType)` — a re-upload replaces the previous file for that type ("Replace").
 */
describe('POST /api/v1/vendors/me/kyc-documents/:documentType', () => {
  it('uploads a valid PDF and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.memberDocument.findUnique.mockResolvedValue(null);
    prismaMock.memberDocument.upsert.mockResolvedValue(documentFixture);
    const res = await request(app)
      .post('/api/v1/vendors/me/kyc-documents/GST')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validPdf(), 'gst.pdf');
    expect(res.status).toBe(201);
    expect(prismaMock.memberDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vendorId_documentType: { vendorId: VENDOR_A_ID, documentType: 'GST' } } }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'member_document.upload' }),
    });
  });

  it('422s an invalid document type in the URL', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    const res = await request(app)
      .post('/api/v1/vendors/me/kyc-documents/PASSPORT')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validPdf(), 'x.pdf');
    expect(res.status).toBe(422);
  });

  it('422s a file that is not a real PDF/JPG/PNG', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .post('/api/v1/vendors/me/kyc-documents/GST')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', invalidFile(), 'fake.pdf');
    expect(res.status).toBe(422);
    expect(prismaMock.memberDocument.upsert).not.toHaveBeenCalled();
  });

  it('replacing an existing document deletes the old file after the new one is committed', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.memberDocument.findUnique.mockResolvedValue({ ...documentFixture, storageKey: 'vendor-documents/x/old.pdf' });
    prismaMock.memberDocument.upsert.mockResolvedValue(documentFixture);
    const res = await request(app)
      .post('/api/v1/vendors/me/kyc-documents/GST')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validPdf(), 'gst-new.pdf');
    expect(res.status).toBe(201);
    const { deleteMediaFile } = await import('../lib/media-storage');
    expect(vi.mocked(deleteMediaFile)).toHaveBeenCalledWith('vendor-documents/x/old.pdf');
  });
});

describe('DELETE /api/v1/vendors/me/kyc-documents/:documentType', () => {
  it('deletes the document and writes an audit log entry', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.memberDocument.findUnique.mockResolvedValue(documentFixture);
    prismaMock.memberDocument.delete.mockResolvedValue(documentFixture);
    const res = await request(app)
      .delete('/api/v1/vendors/me/kyc-documents/GST')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'member_document.delete' }),
    });
  });

  it('404s when no document of that type exists', async () => {
    resolveMock.mockResolvedValue(['members:custom']);
    prismaMock.member.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.memberDocument.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/v1/vendors/me/kyc-documents/PAN')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/vendors/:id/kyc-documents/:documentType (admin-on-behalf)', () => {
  it('403s without members:edit', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/kyc-documents/PAN`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validPdf(), 'pan.pdf');
    expect(res.status).toBe(403);
  });

  it('uploads on behalf of a vendor', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.memberDocument.findUnique.mockResolvedValue(null);
    prismaMock.memberDocument.upsert.mockResolvedValue({ ...documentFixture, documentType: 'PAN' });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/kyc-documents/PAN`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validPdf(), 'pan.pdf');
    expect(res.status).toBe(201);
    expect(prismaMock.memberDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vendorId_documentType: { vendorId: VENDOR_A_ID, documentType: 'PAN' } } }),
    );
    const arg = prismaMock.memberDocument.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ uploadedByUserId: 'admin-1', uploadedOnBehalf: true });
  });

  it('never returns the number hash or ciphertext', async () => {
    resolveMock.mockResolvedValue(['members:edit']);
    prismaMock.memberDocument.findUnique.mockResolvedValue(null);
    prismaMock.memberDocument.upsert.mockResolvedValue({ ...documentFixture, documentType: 'PAN', numberHash: 'h', numberEncrypted: 'c' });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/kyc-documents/PAN`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validPdf(), 'pan.pdf');
    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty('numberHash');
    expect(res.body.data).not.toHaveProperty('numberEncrypted');
  });
});

describe('GET /api/v1/vendors/:id/kyc-documents (admin)', () => {
  const row = { ...documentFixture, status: 'SUBMITTED', numberMasked: 'ABXXXXX34F', numberHash: 'h', numberEncrypted: 'c' };

  it('shows type, masked number and status only to members:view', async () => {
    resolveMock.mockResolvedValue(['members:view']);
    prismaMock.memberDocument.findMany.mockResolvedValue([row]);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/kyc-documents`)
      .set('Authorization', bearerFor({ sub: 'support-1', roles: ['support'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ documentType: 'GST', status: 'SUBMITTED', numberMasked: 'ABXXXXX34F' });
    expect(res.body.data[0]).not.toHaveProperty('storageKey');
    expect(res.body.data[0]).not.toHaveProperty('numberHash');
    expect(res.body.data[0]).not.toHaveProperty('numberEncrypted');
  });

  it('includes file fields for members:edit', async () => {
    resolveMock.mockResolvedValue(['members:view', 'members:edit']);
    prismaMock.memberDocument.findMany.mockResolvedValue([row]);
    const res = await request(app)
      .get(`/api/v1/vendors/${VENDOR_A_ID}/kyc-documents`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data[0].storageKey).toBe(documentFixture.storageKey);
    expect(res.body.data[0]).not.toHaveProperty('numberHash');
  });
});
