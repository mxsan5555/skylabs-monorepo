import { describe, it, expect } from 'vitest';
import {
  normalizeDocumentNumber,
  isValidDocumentNumber,
  maskDocumentNumber,
  verhoeffCheckDigit,
} from './document-number';

const AADHAAR_BASE = '23456789012';
const AADHAAR = AADHAAR_BASE + verhoeffCheckDigit(AADHAAR_BASE);

describe('document numbers', () => {
  it('normalises spaces, hyphens and case', () => {
    expect(normalizeDocumentNumber('PAN', ' abcde-1234 f ')).toBe('ABCDE1234F');
    expect(normalizeDocumentNumber('AADHAAR', '2345 6789 0123')).toBe('234567890123');
  });

  it('accepts a valid PAN and rejects a malformed one', () => {
    expect(isValidDocumentNumber('PAN', 'ABCDE1234F')).toBe(true);
    expect(isValidDocumentNumber('PAN', 'ABCDE12345')).toBe(false);
  });

  it('accepts a valid GST number and rejects a bad state code', () => {
    expect(isValidDocumentNumber('GST', '27ABCDE1234F1Z5')).toBe(true);
    expect(isValidDocumentNumber('GST', '99ABCDE1234F1Z5')).toBe(false);
    expect(isValidDocumentNumber('GST', '27ABCDE1234F1Y5')).toBe(false);
  });

  it('accepts an Aadhaar that passes the Verhoeff check and rejects a one digit change', () => {
    expect(isValidDocumentNumber('AADHAAR', AADHAAR)).toBe(true);
    const last = Number(AADHAAR.slice(-1));
    const broken = AADHAAR.slice(0, -1) + String((last + 1) % 10);
    expect(isValidDocumentNumber('AADHAAR', broken)).toBe(false);
  });

  it('rejects an Aadhaar that starts with 0 or 1', () => {
    expect(isValidDocumentNumber('AADHAAR', '123456789012')).toBe(false);
  });

  it('masks Aadhaar and PAN, and leaves GST readable', () => {
    expect(maskDocumentNumber('AADHAAR', '234567890123')).toBe('XXXX XXXX 0123');
    expect(maskDocumentNumber('PAN', 'ABCDE1234F')).toBe('ABXXXXX34F');
    expect(maskDocumentNumber('GST', '27ABCDE1234F1Z5')).toBe('27ABCDE1234F1Z5');
  });
});
