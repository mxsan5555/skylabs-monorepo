export type DocumentTypeKey = 'GST' | 'PAN' | 'AADHAAR';

/** Names members read in messages and activity. */
export const DOCUMENT_TYPE_LABEL: Record<DocumentTypeKey, string> = {
  AADHAAR: 'Aadhaar card',
  PAN: 'PAN card',
  GST: 'GST number',
};

export function documentTypeList(types: readonly DocumentTypeKey[]): string {
  return types.map((type) => DOCUMENT_TYPE_LABEL[type]).join(', ');
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[A-Z\d]$/;
const AADHAAR_RE = /^[2-9]\d{11}$/;

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

function verhoeffValid(num: string): boolean {
  let c = 0;
  num
    .split('')
    .reverse()
    .map(Number)
    .forEach((d, i) => {
      c = D[c][P[i % 8][d]];
    });
  return c === 0;
}

/** Check digit to append to an 11 digit base so the 12 digit result passes `verhoeffValid`. */
export function verhoeffCheckDigit(base: string): number {
  let c = 0;
  base
    .split('')
    .reverse()
    .map(Number)
    .forEach((d, i) => {
      c = D[c][P[(i + 1) % 8][d]];
    });
  return INV[c];
}

export function normalizeDocumentNumber(_type: DocumentTypeKey, raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidDocumentNumber(type: DocumentTypeKey, normalized: string): boolean {
  if (type === 'PAN') return PAN_RE.test(normalized);
  if (type === 'GST') {
    if (!GST_RE.test(normalized)) return false;
    const state = Number(normalized.slice(0, 2));
    return state >= 1 && state <= 38;
  }
  return AADHAAR_RE.test(normalized) && verhoeffValid(normalized);
}

export function maskDocumentNumber(type: DocumentTypeKey, normalized: string): string {
  if (type === 'AADHAAR') return `XXXX XXXX ${normalized.slice(-4)}`;
  if (type === 'PAN') return `${normalized.slice(0, 2)}XXXXX${normalized.slice(-3)}`;
  return normalized;
}
