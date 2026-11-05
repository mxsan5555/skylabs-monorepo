import { describe, it, expect, vi } from 'vitest';
const { KEY } = vi.hoisted(() => ({
  KEY: Buffer.alloc(32, 7).toString('base64'),
}));
vi.mock('../config/env', () => ({ env: { fieldEncryptionKey: KEY, docHashPepper: 'pepper-1' } }));

import { encryptField, decryptField, hashDocumentNumber, hashesEqual } from './field-crypto';

describe('field crypto', () => {
  it('round trips and never stores the plain value', () => {
    const cipher = encryptField('234567890123');
    expect(cipher).not.toContain('234567890123');
    expect(decryptField(cipher as string)).toBe('234567890123');
  });

  it('uses a fresh IV, so equal inputs give different ciphertext', () => {
    expect(encryptField('same')).not.toBe(encryptField('same'));
  });

  it('refuses a tampered payload', () => {
    const cipher = encryptField('secret') as string;
    const parts = cipher.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptField(parts.join(':'))).toThrow();
  });

  it('hashes deterministically and differently per document type', () => {
    expect(hashDocumentNumber('PAN', 'ABCDE1234F')).toBe(hashDocumentNumber('PAN', 'ABCDE1234F'));
    expect(hashDocumentNumber('PAN', 'ABCDE1234F')).not.toBe(hashDocumentNumber('GST', 'ABCDE1234F'));
  });

  it('compares hashes in constant time and rejects null or mismatched input', () => {
    const h = hashDocumentNumber('PAN', 'ABCDE1234F');
    expect(hashesEqual(h, hashDocumentNumber('PAN', 'ABCDE1234F'))).toBe(true);
    expect(hashesEqual(h, hashDocumentNumber('PAN', 'ABCDE1234G'))).toBe(false);
    expect(hashesEqual(h, null)).toBe(false);
  });
});
