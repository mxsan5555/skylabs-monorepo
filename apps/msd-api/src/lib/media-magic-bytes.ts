/**
 * Hand-rolled magic-byte sniffing for the small, fixed set of formats this upload system
 * accepts (4 image + 3 video). Deliberately not the `file-type` npm package — it's ESM-only and
 * this backend compiles to CommonJS (see tsconfig.app.json), so pulling it in would mean either
 * pinning to a stale CJS-compatible major or wrapping every call in a dynamic import for what's
 * ultimately a handful of leading-byte comparisons. Never trust a client-declared mimetype
 * alone (OWASP file-upload risk) — this is the actual gate.
 */
export type SniffedMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'video/mp4'
  | 'video/webm'
  | 'video/quicktime'
  | 'application/pdf';

function bytesMatch(buffer: Buffer, offset: number, signature: number[]): boolean {
  if (buffer.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[offset + i] !== signature[i]) return false;
  }
  return true;
}

function asciiAt(buffer: Buffer, offset: number, text: string): boolean {
  if (buffer.length < offset + text.length) return false;
  return buffer.toString('ascii', offset, offset + text.length) === text;
}

export function sniffMediaType(buffer: Buffer): SniffedMediaType | null {
  if (bytesMatch(buffer, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytesMatch(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (asciiAt(buffer, 0, 'RIFF') && asciiAt(buffer, 8, 'WEBP')) return 'image/webp';
  if (asciiAt(buffer, 0, '%PDF-')) return 'application/pdf';
  if (bytesMatch(buffer, 0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  // MP4 and MOV/QuickTime are both ISO-BMFF containers — an `ftyp` box at offset 4 is the real
  // signal that this is a valid media container (rejecting a renamed non-media file is the
  // actual OWASP concern here); MP4 vs MOV is disambiguated by the ftyp major-brand tag.
  if (asciiAt(buffer, 4, 'ftyp')) {
    const majorBrand = buffer.toString('ascii', 8, 12);
    if (majorBrand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  return null;
}

export const IMAGE_MIME_TYPES: SniffedMediaType[] = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_MIME_TYPES: SniffedMediaType[] = ['video/mp4', 'video/webm', 'video/quicktime'];
/** JPG/JPEG/PNG/PDF — the KYC-document allow-list (GST/PAN/Aadhaar uploads), per this file's own
 *  "never trust a client-declared mimetype" rule. No WEBP — vendors upload scans/photos of real
 *  documents, not web-optimized images. */
export const DOCUMENT_MIME_TYPES: SniffedMediaType[] = ['image/jpeg', 'image/png', 'application/pdf'];

const EXTENSION_BY_TYPE: Record<SniffedMediaType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
};

export function extensionFor(type: SniffedMediaType): string {
  return EXTENSION_BY_TYPE[type];
}
