import multer from 'multer';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '../services/media-validation.service';

/**
 * Shared multer instances for every media route (Deal/Product/Therapist, image+video) — memory
 * storage only (see media-storage.ts's doc comment for why: full in-memory validation before any
 * bytes are durably written). The `fileSize` limit here is a cheap HTTP-layer DoS guard ahead of
 * app code (roughly 2x the real ceiling, so a legitimately-sized-but-still-rejected file gets a
 * real validation error instead of multer's generic "file too large"); the actual, exact-spec
 * size/format check is media-validation.service.ts, which always runs regardless.
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES * 2 },
});

export const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES * 2 },
});
