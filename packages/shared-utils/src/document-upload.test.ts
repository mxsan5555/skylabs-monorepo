import { describe, it, expect } from 'vitest';
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, DOCUMENT_MAX_MB, DOCUMENT_MIME_TYPES, isDocumentTooLarge } from './document-upload';

describe('document upload rules (P10-37)', () => {
  it('allows 5 MB, the limit msd-api enforces', () => {
    expect(DOCUMENT_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(DOCUMENT_MAX_MB).toBe(5);
  });

  it('accepts PDF, JPEG and PNG by extension and by type', () => {
    expect(DOCUMENT_ACCEPT.split(',')).toEqual(['.pdf', '.jpg', '.jpeg', '.png', 'application/pdf', 'image/jpeg', 'image/png']);
    expect(DOCUMENT_MIME_TYPES).toEqual(['application/pdf', 'image/jpeg', 'image/png']);
  });

  it('flags only files over the limit', () => {
    expect(isDocumentTooLarge({ size: DOCUMENT_MAX_BYTES })).toBe(false);
    expect(isDocumentTooLarge({ size: DOCUMENT_MAX_BYTES + 1 })).toBe(true);
    expect(isDocumentTooLarge({ size: 0 })).toBe(false);
  });
});
