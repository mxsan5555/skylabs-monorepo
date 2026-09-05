import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MediaUploader } from './media-uploader';

// `vi.mock` calls are hoisted above all imports by vitest's transform regardless of their
// source position, so this runs before `MediaUploader`'s own `../../api/media` import resolves.
vi.mock('../../api/media', async () => {
  const actual = await vi.importActual<typeof import('../../api/media')>('../../api/media');
  return {
    ...actual,
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    reorderImages: vi.fn(),
    setPrimaryImage: vi.fn(),
    uploadVideo: vi.fn(),
    deleteVideo: vi.fn(),
  };
});

/**
 * Feature: MediaUploader — `hideVideo` prop (Category is image-only)
 * Scenario: Category has no video adapter registered server-side (see `media.service.ts`'s
 * adapter config map) — `hideVideo` keeps the entire Video section (and its `/video` endpoint)
 * unreachable from the UI, rather than leaving a dead control a category editor could click into
 * a 404/error.
 *
 * Given: MediaUploader rendered for an entity type
 * When: `hideVideo` is passed (Category) vs. omitted (every other entity — Deal/Product/
 *       Therapist/Vendor)
 * Then: `hideVideo=true` renders no Video section at all; every other entity keeps it, unaffected
 *
 * Edge cases:
 * - hideVideo=true with an existing video already on the entity (stale data) still hides the
 *   section entirely rather than rendering a half-wired control
 * - the Images section renders identically regardless of hideVideo — only Video is gated
 */
describe('MediaUploader — hideVideo prop', () => {
  it('renders no Video section at all when hideVideo is true (Category)', () => {
    render(
      <MediaUploader
        entityType="category"
        entityId="cat-1"
        existingImages={[]}
        existingVideo={null}
        hideVideo
        token="tok"
      />,
    );
    expect(screen.queryByText('Video')).toBeNull();
    expect(screen.queryByText('Upload video')).toBeNull();
    expect(document.querySelector('input[type="file"][accept*="video"]')).toBeNull();
  });

  // Edge case: even if the entity somehow already has a video (stale data from before it became
  // Category-scoped, or a bad prop from a caller), hideVideo still wins — no half-wired "existing
  // video with no way to manage it" state.
  it('still hides the Video section when hideVideo is true even if existingVideo is non-null', () => {
    render(
      <MediaUploader
        entityType="category"
        entityId="cat-1"
        existingImages={[]}
        existingVideo={{ id: 'vid-1', storageKey: 'videos/x.mp4', originalFilename: 'x.mp4', mimeType: 'video/mp4', sizeBytes: 1000 }}
        hideVideo
        token="tok"
      />,
    );
    expect(screen.queryByText('Video')).toBeNull();
  });

  it('keeps the Video section for every entity type that omits hideVideo (e.g. Deal)', () => {
    render(
      <MediaUploader
        entityType="deal"
        entityId="deal-1"
        branchId="branch-1"
        existingImages={[]}
        existingVideo={null}
        token="tok"
      />,
    );
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText('Upload video')).toBeTruthy();
  });

  it('keeps the Video section for Product (no hideVideo passed)', () => {
    render(
      <MediaUploader
        entityType="product"
        entityId="product-1"
        vendorId="vendor-1"
        existingImages={[]}
        existingVideo={null}
        token="tok"
      />,
    );
    expect(screen.getByText('Video')).toBeTruthy();
  });

  it('keeps the Video section for Therapist (no hideVideo passed)', () => {
    render(
      <MediaUploader
        entityType="therapist"
        entityId="therapist-1"
        existingImages={[]}
        existingVideo={null}
        token="tok"
      />,
    );
    expect(screen.getByText('Video')).toBeTruthy();
  });

  it('renders the Images section identically regardless of hideVideo', () => {
    const { unmount } = render(
      <MediaUploader entityType="category" entityId="cat-1" existingImages={[]} existingVideo={null} hideVideo token="tok" />,
    );
    expect(screen.getByText('Images')).toBeTruthy();
    expect(screen.getByText('Upload images')).toBeTruthy();
    unmount();

    render(<MediaUploader entityType="deal" entityId="deal-1" branchId="branch-1" existingImages={[]} existingVideo={null} token="tok" />);
    expect(screen.getByText('Images')).toBeTruthy();
    expect(screen.getByText('Upload images')).toBeTruthy();
  });
});
