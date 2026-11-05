/**
 * Member document upload rules, shared by msd-api (which enforces them) and the msd console
 * (which checks the size first only to save a wasted upload). The server stays authoritative:
 * it also sniffs the file's real type from its bytes.
 */

/** Largest document file msd-api accepts. */
export const DOCUMENT_MAX_MB = 5;
export const DOCUMENT_MAX_BYTES = DOCUMENT_MAX_MB * 1024 * 1024;

/** The document types msd-api accepts (it checks the real type from the file's bytes). */
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const DOCUMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'] as const;

/** File picker filter: PDF, JPEG and PNG, by extension and by type. */
export const DOCUMENT_ACCEPT = [...DOCUMENT_EXTENSIONS, ...DOCUMENT_MIME_TYPES].join(',');

export function isDocumentTooLarge(file: { size: number }): boolean {
  return file.size > DOCUMENT_MAX_BYTES;
}
