import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route + service integration tests for the shared Deal/Product/Therapist media-upload system —
// same convention as vendors.routes.test.ts/products.routes.test.ts: real Express app, real
// vendor.service/product.service/media.service logic, only the Prisma boundary + permission
// resolver + disk I/O are mocked.
vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
}));

vi.mock('../lib/media-storage', () => ({
  getUploadRoot: vi.fn(() => '/fake/uploads/media'),
  writeMediaFile: vi.fn(async (subdir: string, parentId: string, buffer: Buffer) => ({
    storageKey: `${subdir}/${parentId}/fake.jpg`,
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
const VENDOR_A_ID = 'c0c0c0c0-0000-4000-8000-000000000003';
const VENDOR_B_ID = 'd0d0d0d0-0000-4000-8000-000000000004';
const BRANCH_A_ID = 'e0e0e0e0-0000-4000-8000-000000000005';
const DEAL_A_ID = 'a1a1a1a1-0000-4000-8000-000000000007';
const THERAPIST_A_ID = 'a2a2a2a2-0000-4000-8000-000000000010';
const THERAPIST_B_ID = 'a2a2a2a2-0000-4000-8000-000000000011';
const PRODUCT_ID = 'd1d1d1d1-0000-4000-8000-00000000000a';
const IMAGE_ID = 'f1f1f1f1-0000-4000-8000-000000000012';

const vendorAFixture = { id: VENDOR_A_ID, ownerUserId: USER_A_ID, businessName: 'Vendor A Spa', status: 'ACTIVE', kycStatus: 'VERIFIED' };
const branchAFixture = { id: BRANCH_A_ID, vendorId: VENDOR_A_ID, name: 'Branch A', isActive: true };
const dealAFixture = { id: DEAL_A_ID, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, title: 'Deep tissue' };
const therapistAFixture = { id: THERAPIST_A_ID, vendorId: VENDOR_A_ID, branchId: BRANCH_A_ID, personName: 'Ramesh' };
const therapistBFixture = { id: THERAPIST_B_ID, vendorId: VENDOR_B_ID, branchId: 'other-branch', personName: 'Someone Else' };
const productFixture = { id: PRODUCT_ID, name: 'Face Cream', categoryId: 'cat-1', subcategoryId: null };

/** A byte-exact, magic-byte-valid JPEG buffer within the 30KB-80KB window. */
function validJpeg(): Buffer {
  const buffer = Buffer.alloc(50 * 1024, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('POST /api/v1/vendors/me/branches/:branchId/deals/:dealId/images', () => {
  it('uploads a valid image for the caller\'s own deal', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
    prismaMock.dealImage.count.mockResolvedValue(0);
    prismaMock.dealImage.create.mockResolvedValue({ id: IMAGE_ID, isPrimary: true });

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(prismaMock.dealImage.create).toHaveBeenCalled();
  });

  it('rejects an out-of-range file with a 422 and a clear message, never a 500', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue(dealAFixture);
    prismaMock.dealImage.count.mockResolvedValue(0);

    const tooSmall = Buffer.alloc(20 * 1024, 0);
    tooSmall[0] = 0xff;
    tooSmall[1] = 0xd8;
    tooSmall[2] = 0xff;

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', tooSmall, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Image size must be between 30 KB and 80 KB.');
    expect(prismaMock.dealImage.create).not.toHaveBeenCalled();
  });

  it('403s when the deal belongs to a different vendor (cross-tenant ownership check)', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture); // caller is vendor A
    prismaMock.branch.findUnique.mockResolvedValue(branchAFixture);
    prismaMock.deal.findUnique.mockResolvedValue({ ...dealAFixture, vendorId: VENDOR_B_ID }); // deal actually belongs to vendor B

    const res = await request(app)
      .post(`/api/v1/vendors/me/branches/${BRANCH_A_ID}/deals/${DEAL_A_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(prismaMock.dealImage.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/vendors/me/therapists/:therapistId/images', () => {
  it('403s when the therapist belongs to a different vendor', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.therapist.findUnique.mockResolvedValue(therapistBFixture);

    const res = await request(app)
      .post(`/api/v1/vendors/me/therapists/${THERAPIST_B_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(prismaMock.therapistImage.create).not.toHaveBeenCalled();
  });

  it('uploads a valid image for the caller\'s own therapist', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.therapist.findUnique.mockResolvedValue(therapistAFixture);
    prismaMock.therapistImage.count.mockResolvedValue(0);
    prismaMock.therapistImage.create.mockResolvedValue({ id: IMAGE_ID, isPrimary: true });

    const res = await request(app)
      .post(`/api/v1/vendors/me/therapists/${THERAPIST_A_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
  });
});

describe('POST /api/v1/vendors/me/products/:productId/images', () => {
  it("uploads a valid image for the caller's own product", async () => {
    resolveMock.mockResolvedValue(['products:edit', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_A_ID });
    prismaMock.productImage.count.mockResolvedValue(0);
    prismaMock.productImage.create.mockResolvedValue({ id: IMAGE_ID, isPrimary: true });

    const res = await request(app)
      .post(`/api/v1/vendors/me/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
  });

  it('404s uploading to a product that does not exist', async () => {
    resolveMock.mockResolvedValue(['products:edit', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/vendors/me/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  it("403s uploading to another vendor's product", async () => {
    resolveMock.mockResolvedValue(['products:edit', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_B_ID });

    const res = await request(app)
      .post(`/api/v1/vendors/me/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });

  it('403s without the products:edit permission', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);

    const res = await request(app)
      .post(`/api/v1/vendors/me/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/vendors/me/products/:productId/images/reorder and DELETE', () => {
  it('reorders images for the caller\'s own product', async () => {
    const imgId1 = 'f1f1f1f1-0000-4000-8000-000000000101';
    const imgId2 = 'f1f1f1f1-0000-4000-8000-000000000102';
    resolveMock.mockResolvedValue(['products:edit', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_A_ID });
    prismaMock.productImage.findMany.mockResolvedValue([{ id: imgId1 }, { id: imgId2 }]);
    prismaMock.productImage.update.mockResolvedValue({});

    const res = await request(app)
      .patch(`/api/v1/vendors/me/products/${PRODUCT_ID}/images/reorder`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .send({ imageIds: [imgId2, imgId1] });

    expect(res.status).toBe(200);
  });

  it('deletes an image for the caller\'s own product', async () => {
    resolveMock.mockResolvedValue(['products:edit', 'vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.product.findUnique.mockResolvedValue({ ...productFixture, vendorId: VENDOR_A_ID });
    prismaMock.productImage.findUnique.mockResolvedValue({ id: IMAGE_ID, productId: PRODUCT_ID, isPrimary: false, storageKey: 'x' });
    prismaMock.productImage.delete.mockResolvedValue({ storageKey: 'x' });

    const res = await request(app)
      .delete(`/api/v1/vendors/me/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }));

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/vendors/me/images', () => {
  it('uploads a valid image for the caller\'s own vendor', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.count.mockResolvedValue(0);
    prismaMock.vendorImage.create.mockResolvedValue({ id: IMAGE_ID, isPrimary: true });

    const res = await request(app)
      .post('/api/v1/vendors/me/images')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'logo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(prismaMock.vendorImage.create).toHaveBeenCalled();
  });

  it('404s when the caller has no vendor profile yet', async () => {
    resolveMock.mockResolvedValue(['vendors:custom']);
    prismaMock.vendor.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/vendors/me/images')
      .set('Authorization', bearerFor({ sub: USER_A_ID, roles: ['vendor'] }))
      .attach('file', validJpeg(), { filename: 'logo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
    expect(prismaMock.vendorImage.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/vendors/:id/images (admin)', () => {
  it('uploads a valid image for any vendor when permitted', async () => {
    resolveMock.mockResolvedValue(['vendors:edit']);
    prismaMock.vendor.findUnique.mockResolvedValue(vendorAFixture);
    prismaMock.vendorImage.count.mockResolvedValue(0);
    prismaMock.vendorImage.create.mockResolvedValue({ id: IMAGE_ID, isPrimary: true });

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/images`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validJpeg(), { filename: 'logo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
  });

  it('403s without the vendors:edit permission', async () => {
    resolveMock.mockResolvedValue([]);

    const res = await request(app)
      .post(`/api/v1/vendors/${VENDOR_A_ID}/images`)
      .set('Authorization', bearerFor({ sub: 'admin-1', roles: ['admin'] }))
      .attach('file', validJpeg(), { filename: 'logo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });
});
