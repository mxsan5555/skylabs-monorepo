import { ApiError } from '../lib/http';
import {
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  extensionFor,
  sniffMediaType,
  type SniffedMediaType,
} from '../lib/media-magic-bytes';

export const IMAGE_MIN_BYTES = 30 * 1024;
export const IMAGE_MAX_BYTES = 80 * 1024;
export const VIDEO_MAX_BYTES = 1 * 1024 * 1024;
export const MAX_IMAGES_PER_ENTITY = 8;

export interface ValidatedMediaFile {
  sniffedType: SniffedMediaType;
  extension: string;
  sizeBytes: number;
}

/**
 * The single gate every image/video upload passes through, for all three entities. Never trust
 * the client-declared mimetype/extension — sniffs actual magic bytes (media-magic-bytes.ts) and
 * enforces the exact size windows from the product spec. Frontend-side compression/validation is
 * UX only; this is the real boundary (backend must ALSO validate, per the spec).
 */
export function validateMediaFile(
  buffer: Buffer,
  kind: 'image' | 'video',
): ValidatedMediaFile {
  const sniffedType = sniffMediaType(buffer);
  if (!sniffedType) {
    throw new ApiError('VALIDATION_ERROR', 'Unrecognized or unsupported file format.');
  }

  const allowList = kind === 'image' ? IMAGE_MIME_TYPES : VIDEO_MIME_TYPES;
  if (!allowList.includes(sniffedType)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      kind === 'image'
        ? 'Images must be JPG, JPEG, PNG, or WEBP.'
        : 'Videos must be MP4, WEBM, or MOV.',
    );
  }

  if (kind === 'image') {
    if (buffer.length < IMAGE_MIN_BYTES || buffer.length > IMAGE_MAX_BYTES) {
      throw new ApiError('VALIDATION_ERROR', 'Image size must be between 30 KB and 80 KB.');
    }
  } else {
    if (buffer.length > VIDEO_MAX_BYTES) {
      throw new ApiError('VALIDATION_ERROR', 'Video size must not exceed 1 MB.');
    }
  }

  return { sniffedType, extension: extensionFor(sniffedType), sizeBytes: buffer.length };
}
