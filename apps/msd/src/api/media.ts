import { apiPostForm, apiDelete, apiPatch } from './rbac/client';

/**
 * Media-upload API client for the shared Deal/Product/Therapist/Vendor/Category upload system
 * (see `apps/msd/src/app/components/media-uploader.tsx`) — one client, parameterized by
 * entityType, mirroring `media.service.ts`'s shared backend core. Deal's route nests under a
 * branch (see `vendors.routes.ts`), so it alone needs a `branchId` too. Category is image-only
 * (no video adapter registered server-side) — `MediaUploader`'s `hideVideo` prop keeps its
 * `/video` endpoint unreachable from the UI rather than relying on callers to simply never wire
 * `onVideoChange`.
 */

export type MediaEntityType = 'deal' | 'product' | 'therapist' | 'vendor' | 'category';

export interface MediaImage {
  id: string;
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  isPrimary: boolean;
}

export interface MediaVideo {
  id: string;
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
}

interface EntityRef {
  entityType: MediaEntityType;
  entityId: string;
  /** Deal only — its routes nest under `/vendors/me/branches/:branchId/deals/:dealId/...`. */
  branchId?: string;
  /** Vendor/Product/Therapist only — the caller's own vendor/product/therapist (self-service,
   *  `/vendors/me/...`, gated on `vendors:custom`/`products:*`) vs. an admin managing a different
   *  vendor's profile/product/therapist (`/vendors/:id/...`, gated on `vendors:edit`/
   *  `products:*`) hit different route surfaces. */
  selfService?: boolean;
  /** Product/Therapist (admin-on-behalf) only — the vendor id the product/therapist belongs to,
   *  when `selfService` is false. Both are vendor-owned; there is no vendor-agnostic
   *  `/products/:id/...` or `/therapists/:id/...` media route. */
  vendorId?: string;
}

function basePath(ref: EntityRef): string {
  switch (ref.entityType) {
    case 'deal':
      return `/vendors/me/branches/${ref.branchId}/deals/${ref.entityId}`;
    case 'therapist':
      return ref.selfService ? `/vendors/me/therapists/${ref.entityId}` : `/vendors/${ref.vendorId}/therapists/${ref.entityId}`;
    case 'product':
      return ref.selfService ? `/vendors/me/products/${ref.entityId}` : `/vendors/${ref.vendorId}/products/${ref.entityId}`;
    case 'vendor':
      return ref.selfService ? '/vendors/me' : `/vendors/${ref.entityId}`;
    case 'category':
      // Category's image routes are top-level (`/categories/:id/images...`, see
      // `categories.routes.ts`) — no branch/vendor nesting, and image-only (no `/video` route
      // exists server-side; `MediaUploader`'s `hideVideo` prop keeps that endpoint unreachable
      // from the Category dialogs).
      return `/categories/${ref.entityId}`;
  }
}

export function uploadImage(token: string | null, ref: EntityRef, blob: Blob, filename: string) {
  const formData = new FormData();
  formData.append('file', blob, filename);
  return apiPostForm<MediaImage>(`${basePath(ref)}/images`, token, formData);
}

export function deleteImage(token: string | null, ref: EntityRef, imageId: string) {
  return apiDelete<{ deleted: true }>(`${basePath(ref)}/images/${imageId}`, token);
}

export function reorderImages(token: string | null, ref: EntityRef, imageIds: string[]) {
  return apiPatch<{ reordered: true }>(`${basePath(ref)}/images/reorder`, token, { imageIds });
}

export function setPrimaryImage(token: string | null, ref: EntityRef, imageId: string) {
  return apiPatch<{ primary: true }>(`${basePath(ref)}/images/${imageId}/primary`, token);
}

export function uploadVideo(token: string | null, ref: EntityRef, blob: Blob, filename: string) {
  const formData = new FormData();
  formData.append('file', blob, filename);
  return apiPostForm<MediaVideo>(`${basePath(ref)}/video`, token, formData);
}

export function deleteVideo(token: string | null, ref: EntityRef) {
  return apiDelete<{ deleted: true }>(`${basePath(ref)}/video`, token);
}

/**
 * Builds the full displayable URL for a `storageKey`. Legacy backfilled rows store the original
 * external URL as their storageKey (see the backend's one-time media backfill) — pass those
 * through unchanged; a real relative storageKey gets prefixed with the API origin's `/media`
 * mount (see msd-api's `app.ts`).
 */
export function resolveMediaUrl(storageKey: string): string {
  if (/^https?:\/\//i.test(storageKey)) return storageKey;
  const apiBase: string = import.meta.env.VITE_API_URL ?? '';
  const origin = apiBase.replace(/\/api\/v1\/?$/, '');
  return `${origin}/media/${storageKey}`;
}
