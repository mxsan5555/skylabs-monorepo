/**
 * Vendor profile logo upload rules, shared by msd-api (which enforces them) and the msd console
 * (which checks the size/type first only to save a wasted upload). The server stays
 * authoritative: it also sniffs the file's real type from its bytes. Unlike the 30KB-80KB
 * product-photo window (media-validation.service.ts), a logo has no forced minimum and is never
 * re-encoded to JPEG — logos are simple graphics that often rely on PNG/WEBP transparency.
 */
export const LOGO_MAX_KB = 300;
export const LOGO_MAX_BYTES = LOGO_MAX_KB * 1024;

export const LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const LOGO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

/** File picker filter: JPEG, PNG and WEBP, by extension and by type. */
export const LOGO_ACCEPT = [...LOGO_EXTENSIONS, ...LOGO_MIME_TYPES].join(',');

export function isLogoTooLarge(file: { size: number }): boolean {
  return file.size > LOGO_MAX_BYTES;
}
