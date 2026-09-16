import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadImage,
  deleteImage,
  reorderImages,
  setPrimaryImage,
  uploadVideo,
  deleteVideo,
  resolveMediaUrl,
} from './media';

/**
 * Feature: media API client — Category entity wiring (`entityType: 'category'`)
 * Scenario: Category's image routes are top-level (`/categories/:id/images...`, no branch/vendor
 * nesting) and image-only (no `/video` adapter exists server-side — see `media.service.ts`'s
 * adapter config map, and `MediaUploader`'s `hideVideo` prop, which keeps the UI from ever
 * calling `uploadVideo`/`deleteVideo` for a category in practice).
 *
 * Given: a category `EntityRef` (`{ entityType: 'category', entityId }`)
 * When: upload/delete/reorder/set-primary image calls are made
 * Then: each hits `/categories/:id/images...` — never `/vendors/...` or `/vendors/me/...`
 *
 * Edge cases:
 * - a category image upload/delete/reorder call never includes a branchId/vendorId query param
 *   or path segment, unlike Deal/Product
 * - resolveMediaUrl passes a legacy absolute URL storageKey through unchanged (category rows can
 *   carry no such legacy data today, but the helper is shared, so this guards against a regression
 *   leaking into every entity type, category included)
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { id: 'img-1' }, error: null }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function calledUrl(): string {
  expect(fetchMock).toHaveBeenCalled();
  return fetchMock.mock.calls[0][0] as string;
}

function calledInit(): RequestInit {
  return fetchMock.mock.calls[0][1] as RequestInit;
}

describe('media API client — category entity', () => {
  it('uploadImage hits /categories/:id/images with a POST + FormData body, no branch/vendor segment', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    await uploadImage('tok', { entityType: 'category', entityId: 'cat-1' }, blob, 'photo.png');

    expect(calledUrl()).toMatch(/\/categories\/cat-1\/images$/);
    expect(calledUrl()).not.toMatch(/\/vendors\//);
    expect(calledInit().method).toBe('POST');
    expect(calledInit().body).toBeInstanceOf(FormData);
  });

  it('deleteImage hits /categories/:id/images/:imageId with DELETE', async () => {
    await deleteImage('tok', { entityType: 'category', entityId: 'cat-1' }, 'img-9');
    expect(calledUrl()).toMatch(/\/categories\/cat-1\/images\/img-9$/);
    expect(calledInit().method).toBe('DELETE');
  });

  it('reorderImages hits /categories/:id/images/reorder with PATCH and the ordered id list as the body', async () => {
    await reorderImages('tok', { entityType: 'category', entityId: 'cat-1' }, ['img-2', 'img-1']);
    expect(calledUrl()).toMatch(/\/categories\/cat-1\/images\/reorder$/);
    expect(calledInit().method).toBe('PATCH');
    expect(JSON.parse(calledInit().body as string)).toEqual({ imageIds: ['img-2', 'img-1'] });
  });

  it('setPrimaryImage hits /categories/:id/images/:imageId/primary with PATCH', async () => {
    await setPrimaryImage('tok', { entityType: 'category', entityId: 'cat-1' }, 'img-1');
    expect(calledUrl()).toMatch(/\/categories\/cat-1\/images\/img-1\/primary$/);
    expect(calledInit().method).toBe('PATCH');
  });

  // Edge case: unlike Deal (branch-nested) or Product (vendor-nested), a category ref never
  // carries/needs branchId/vendorId — passing them (a caller mistake) must not leak into the URL,
  // since Category's basePath ignores them entirely (see media.ts's `basePath` switch).
  it('ignores a stray branchId/vendorId on a category ref — basePath is always the simple top-level form', async () => {
    await uploadImage(
      'tok',
      { entityType: 'category', entityId: 'cat-1', branchId: 'should-be-ignored', vendorId: 'also-ignored' },
      new Blob(['x']),
      'photo.png',
    );
    expect(calledUrl()).toMatch(/\/categories\/cat-1\/images$/);
    expect(calledUrl()).not.toContain('should-be-ignored');
    expect(calledUrl()).not.toContain('also-ignored');
  });

  // Regression: uploadVideo/deleteVideo are still callable at the client-function level for
  // category (nothing throws) even though the backend has no adapter for it — the UI's own
  // safeguard is `hideVideo` on MediaUploader, not a client-side guard here. Documents the
  // resulting URL shape so a future backend 404 is traceable back to this contract.
  it('uploadVideo/deleteVideo for category resolve to /categories/:id/video (server-side 404s if ever actually called — UI-guarded by hideVideo)', async () => {
    await uploadVideo('tok', { entityType: 'category', entityId: 'cat-1' }, new Blob(['x']), 'v.mp4');
    expect(calledUrl()).toMatch(/\/categories\/cat-1\/video$/);

    fetchMock.mockClear();
    await deleteVideo('tok', { entityType: 'category', entityId: 'cat-1' });
    expect(calledUrl()).toMatch(/\/categories\/cat-1\/video$/);
  });
});

describe('media API client — other entity basePaths still behave unchanged (regression)', () => {
  it('deal nests under /vendors/me/branches/:branchId/deals/:dealId', async () => {
    await uploadImage('tok', { entityType: 'deal', entityId: 'deal-1', branchId: 'branch-1' }, new Blob(['x']), 'p.png');
    expect(calledUrl()).toMatch(/\/vendors\/me\/branches\/branch-1\/deals\/deal-1\/images$/);
  });

  it('product (self-service) nests under /vendors/me/products/:id', async () => {
    await uploadImage('tok', { entityType: 'product', entityId: 'product-1', selfService: true }, new Blob(['x']), 'p.png');
    expect(calledUrl()).toMatch(/\/vendors\/me\/products\/product-1\/images$/);
  });

  it('product (admin-on-behalf) nests under /vendors/:vendorId/products/:id', async () => {
    await uploadImage('tok', { entityType: 'product', entityId: 'product-1', vendorId: 'vendor-9' }, new Blob(['x']), 'p.png');
    expect(calledUrl()).toMatch(/\/vendors\/vendor-9\/products\/product-1\/images$/);
  });

  it('vendor (self-service) hits /vendors/me', async () => {
    await uploadImage('tok', { entityType: 'vendor', entityId: 'vendor-1', selfService: true }, new Blob(['x']), 'p.png');
    expect(calledUrl()).toMatch(/\/vendors\/me\/images$/);
  });
});

describe('resolveMediaUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('passes a legacy absolute http(s) storageKey through unchanged', () => {
    expect(resolveMediaUrl('https://legacy.example.com/old-photo.jpg')).toBe('https://legacy.example.com/old-photo.jpg');
    expect(resolveMediaUrl('http://legacy.example.com/old-photo.jpg')).toBe('http://legacy.example.com/old-photo.jpg');
  });

  it('prefixes a real relative storageKey with the R2 public base URL', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://pub-abc.r2.dev');
    expect(resolveMediaUrl('categories/abc123.webp')).toBe('https://pub-abc.r2.dev/categories/abc123.webp');
  });

  it('does not double a trailing slash on the base URL', () => {
    vi.stubEnv('VITE_MEDIA_BASE_URL', 'https://pub-abc.r2.dev/');
    expect(resolveMediaUrl('deals/d1/x.jpg')).toBe('https://pub-abc.r2.dev/deals/d1/x.jpg');
  });
});
