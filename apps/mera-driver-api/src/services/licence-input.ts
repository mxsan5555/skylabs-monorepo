import { HttpError } from '../middleware/errorHandler';

export const normalizeLicenceInput = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();
/** Historical identifiers remain readable and unchanged; new/edited entries use the common format. */
export function validateLicenceInput(input: Record<string, unknown>, existing?: string | null) {
  if (typeof input.dlNo !== 'string' || input.dlNo === existing) return;
  const normalized = normalizeLicenceInput(input.dlNo);
  if (existing && normalized === normalizeLicenceInput(existing)) { input.dlNo = existing; return; }
  if (normalized && !/^[A-Z]{2}\d{13}$/.test(normalized)) {
    throw new HttpError(422, 'DL_FORMAT_INVALID', 'Enter 15 characters: two letters followed by 13 digits, for example UP3220210123456.');
  }
  input.dlNo = normalized;
}
