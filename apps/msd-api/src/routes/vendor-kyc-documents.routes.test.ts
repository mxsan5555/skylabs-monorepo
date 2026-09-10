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
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorDocument.findUnique.mockResolvedValue(null);
    prismaMock.vendorDocument.upsert.mockResolvedValue(documentFixture);
    const res = await request(app)
      .post('/api/v1/vendors/me/kyc-documents/GST')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validPdf(), 'gst.pdf');
    expect(res.status).toBe(201);
    expect(prismaMock.vendorDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vendorId_documentType: { vendorId: VENDOR_A_ID, documentType: 'GST' } } }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('422s an invalid document type in the URL', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    const res = await request(app)
      .post('/api/v1/vendors/me/kyc-documents/PASSPORT')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validPdf(), 'x.pdf');
    expect(res.status).toBe(422);
  });

  it('422s a file that is not a real PDF/JPG/PNG', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    const res = await request(app)
      .post('/api/v1/vendors/me/kyc-documents/GST')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', invalidFile(), 'fake.pdf');
    expect(res.status).toBe(422);
    expect(prismaMock.vendorDocument.upsert).not.toHaveBeenCalled();
  });

  it('replacing an existing document deletes the old file after the new one is committed', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorDocument.findUnique.mockResolvedValue({ ...documentFixture, storageKey: 'vendor-documents/x/old.pdf' });
    prismaMock.vendorDocument.upsert.mockResolvedValue(documentFixture);
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
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorDocument.findUnique.mockResolvedValue(documentFixture);
    prismaMock.vendorDocument.delete.mockResolvedValue(documentFixture);
    const res = await request(app)
      .delete('/api/v1/vendors/me/kyc-documents/GST')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledOnce();
  });

  it('404s when no document of that type exists', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorDocument.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/v1/vendors/me/kyc-documents/PAN')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(404);
  });
});

/**
 * Feature: `submitForVerification`'s server-side KYC gate — real `VendorDocument` rows are now
 * authoritative (see `hasMinimumKycDocument`'s own doc comment); the legacy `kycDocuments` JSON
 * regex is kept only as a fallback so a vendor onboarded before real file upload existed doesn't
 * regress. Also verifies `REQUIRED_FOR_SUBMISSION` no longer demands the deprecated
 * `gstNumber`/`panNumber` scalar text fields, since the current form never writes them.
 */
describe('POST /api/v1/vendors/me/submit', () => {
  const completeVendor = {
    ...vendorAFixture,
    status: 'PROFILE_INCOMPLETE',
    businessPhone: '+919876543210',
    ownerFirstName: 'Priya',
    ownerLastName: 'Sharma',
    ownerMobile: '+919876543211',
    ownerEmail: 'priya@example.com',
    address: '123 Main St',
    city: 'Gorakhpur',
    state: 'Uttar Pradesh',
    pincode: '273001',
    latitude: 26.76,
    longitude: 83.37,
    businessEmail: 'vendor@example.com',
    offersService: true,
    kycDocuments: null,
  };

  it('succeeds when every REQUIRED_FOR_SUBMISSION field is set and a real VendorDocument exists — no gstNumber/panNumber scalar required', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(completeVendor);
    prismaMock.vendorDocument.count.mockResolvedValue(1);
    prismaMock.branch.findMany.mockResolvedValue([{ state: 'Uttar Pradesh' }]);
    prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([{ category: { type: 'SERVICE' } }]);
    prismaMock.vendor.update.mockResolvedValue({ ...completeVendor, status: 'PENDING_VERIFICATION' });
    prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }]);
    const res = await request(app)
      .post('/api/v1/vendors/me/submit')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
  });

  /**
   * Feature: submitting a complete profile creates exactly one VENDOR_PENDING_APPROVAL
   * notification per Superadmin, atomically with the status flip — mirrors createDeal's own
   * notifySuperAdmins call-site pattern. `submitForVerification`'s own precondition (status must
   * currently be PROFILE_INCOMPLETE/REJECTED) is the duplicate-prevention: a second submit
   * attempt on an already-PENDING_VERIFICATION vendor 409s before ever reaching this code, so it
   * can never create a second notification for the same submission.
   */
  it('creates one VENDOR_PENDING_APPROVAL notification per Superadmin, inside the same transaction as the status update', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(completeVendor);
    prismaMock.vendorDocument.count.mockResolvedValue(1);
    prismaMock.branch.findMany.mockResolvedValue([{ state: 'Uttar Pradesh' }]);
    prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([{ category: { type: 'SERVICE' } }]);
    prismaMock.vendor.update.mockResolvedValue({ ...completeVendor, status: 'PENDING_VERIFICATION' });
    prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }, { id: 'superadmin-2' }]);
    prismaMock.notification.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/vendors/me/submit')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'superadmin-1',
          recipientType: 'SUPERADMIN',
          type: 'VENDOR_PENDING_APPROVAL',
          entityType: 'VENDOR',
          entityId: VENDOR_A_ID,
        }),
      }),
    );
  });

  it('does not create a duplicate notification when re-submitting an already-pending vendor — blocked by the existing status precondition', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue({ ...completeVendor, status: 'PENDING_VERIFICATION' });
    const res = await request(app)
      .post('/api/v1/vendors/me/submit')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(409);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('rejects when no KYC document exists at all (neither real nor legacy)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(completeVendor);
    prismaMock.vendorDocument.count.mockResolvedValue(0);
    prismaMock.branch.findMany.mockResolvedValue([{ state: 'Uttar Pradesh' }]);
    prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([{ category: { type: 'SERVICE' } }]);
    const res = await request(app)
      .post('/api/v1/vendors/me/submit')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(422);
    expect(res.body.error.details.missing).toEqual(expect.arrayContaining([expect.stringContaining('KYC document')]));
  });

  it('still succeeds via the legacy kycDocuments JSON fallback when no real VendorDocument exists (backward compatibility)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue({
      ...completeVendor,
      kycDocuments: [{ type: 'GST', url: 'https://old-storage.example.com/gst.pdf' }],
    });
    prismaMock.vendorDocument.count.mockResolvedValue(0);
    prismaMock.branch.findMany.mockResolvedValue([{ state: 'Uttar Pradesh' }]);
    prismaMock.vendorCategoryAccess.findMany.mockResolvedValue([{ category: { type: 'SERVICE' } }]);
    prismaMock.vendor.update.mockResolvedValue({ ...completeVendor, status: 'PENDING_VERIFICATION' });
    prismaMock.user.findMany.mockResolvedValue([{ id: 'superadmin-1' }]);
    const res = await request(app)
      .post('/api/v1/vendors/me/submit')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/vendors/:id/kyc-documents/:documentType (admin-on-behalf)', () => {
  it('403s without vendors:edit', async () => {
    resolveMock.mockResolvedValue(['vendors:view']);
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/kyc-documents/PAN`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validPdf(), 'pan.pdf');
    expect(res.status).toBe(403);
  });

  it('uploads on behalf of a vendor', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.vendorDocument.findUnique.mockResolvedValue(null);
    prismaMock.vendorDocument.upsert.mockResolvedValue({ ...documentFixture, documentType: 'PAN' });
    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/kyc-documents/PAN`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validPdf(), 'pan.pdf');
    expect(res.status).toBe(201);
    expect(prismaMock.vendorDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vendorId_documentType: { vendorId: VENDOR_A_ID, documentType: 'PAN' } } }),
    );
  });
});
