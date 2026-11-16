import { HttpError } from '../../middleware/errorHandler';
import { parseDlResponse, type DlAssessment, type DlResponsePolicy } from './dl.response';

export const IDSPAY_DL_URL = 'https://javabackend.idspay.in/api/v1/prod/srv2/validation/dl';
export interface DlInput { dlNo: string | null; dob: string | null }
export interface DlConfiguration { url: string; apiId: string; apiKey: string; tokenId: string }
export type DlResult = DlAssessment | { status: 'Provider failed' | 'Manual review required'; reason: string };

export interface DlRequestContract {method:'POST';headers:Record<string,string>;bodyEncoding:'json'}
/** User-confirmed exact srv2 contract: POST raw JSON, no Bearer/header additions. */
export const DL_REQUEST_CONTRACT:DlRequestContract={method:'POST',headers:{'Content-Type':'application/json'},bodyEncoding:'json'};
export const dlRequestEnabled=()=>true;

export function dlConfiguration(env: NodeJS.ProcessEnv = process.env): DlConfiguration {
  const required = ['IDSPAY_DL_API_ID', 'IDSPAY_DL_API_KEY', 'IDSPAY_DL_TOKEN_ID'] as const;
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new HttpError(503, 'IDSPAY_NOT_CONFIGURED', `Missing server configuration: ${missing.join(', ')}`);
  const url = env.IDSPAY_DL_API_URL?.trim() || IDSPAY_DL_URL;
  if (url !== IDSPAY_DL_URL) throw new HttpError(503, 'IDSPAY_ENDPOINT_INVALID', 'The configured URL must be the supplied IDSPay srv2 DL endpoint');
  return { url, apiId: env.IDSPAY_DL_API_ID!.trim(), apiKey: env.IDSPAY_DL_API_KEY!.trim(), tokenId: env.IDSPAY_DL_TOKEN_ID!.trim() };
}

export function formatDlDob(value: string | null, today = new Date()): string {
  const iso = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const supplied = value?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!iso && !supplied) throw new HttpError(422, 'DL_DOB_INVALID', 'Save a valid date of birth before verification');
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(supplied![3]), Number(supplied![2]), Number(supplied![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date > today || year < 1900) {
    throw new HttpError(422, 'DL_DOB_INVALID', 'Date of birth must be a real, non-future calendar date');
  }
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
}

export function buildDlRequest(driver: DlInput, config: DlConfiguration) {
  const dlNumber = driver.dlNo?.trim();
  if (!dlNumber || !/^[A-Za-z0-9 -]{8,30}$/.test(dlNumber)) throw new HttpError(422, 'DL_NUMBER_INVALID', 'Save a valid driving licence number before verification');
  return { api_id: config.apiId, api_key: config.apiKey, token_id: config.tokenId, dlNumber, dob: formatDlDob(driver.dob) };
}

export function requireDlContract():DlRequestContract {return DL_REQUEST_CONTRACT;}

/** Bounded injectable transport. No automatic retries, secret logging or raw-response persistence. */
export async function sendDlRequest(
  config: DlConfiguration,
  body: ReturnType<typeof buildDlRequest>,
  method: 'POST',
  transport: typeof fetch,
  timeoutMs = 10_000,
  policy:DlResponsePolicy={},
  headers:Record<string,string>={'Content-Type':'application/json'},
): Promise<DlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(config.url, { method, headers, body: JSON.stringify(body), signal: controller.signal });
    if(response.status===401||response.status===403)return {status:'Provider failed',reason:'IDSPAY_AUTHENTICATION_FAILED'};
    if (!response.ok) return { status: 'Provider failed', reason: `Provider returned HTTP ${response.status}` };
    let raw: unknown;
    try { raw = await response.json(); }
    catch { return { status: 'Manual review required', reason: 'Provider response is not valid JSON' }; }
    return parseDlResponse(raw, { dlNo: body.dlNumber, dob: body.dob },policy);
  } catch {
    return { status: 'Provider failed', reason: controller.signal.aborted ? 'Provider request timed out' : 'Provider could not be reached' };
  } finally { clearTimeout(timer); }
}
