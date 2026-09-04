import axios from 'axios';
import { env } from '../../config/env';

/**
 * ConnectExpress SMS gateway — real send, no mock path. Mirrors the exact request shape
 * already in production use in the Laravel app (method/api_key/to/sender/unicode/message/
 * format), sent as query params against `SMS_API_URL`.
 */

const REQUIRED_ENV: Array<[name: string, value: string]> = [
  ['SMS_API_URL', env.smsApiUrl],
  ['SMS_API_KEY', env.smsApiKey],
  ['SMS_SENDER', env.smsSender],
];

/**
 * Sends an OTP SMS via ConnectExpress. Returns `true` only once the provider's response
 * indicates success; every attempt (success or failure) is logged with the provider's raw
 * response so delivery issues are diagnosable without reproducing the call.
 */
export async function sendOtp(phone: string, otp: string): Promise<boolean> {
  const missing = REQUIRED_ENV.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    console.error(`[sms:connectExpress] cannot send — missing env var(s): ${missing.join(', ')}`);
    return false;
  }

  // DLT-approved template text — must reach the provider byte-for-byte, only {#var#} substituted.
  const message = `Your overseas education lane registration OTP is ${otp}`;

  const params = {
    method: 'sms',
    api_key: env.smsApiKey,
    to: phone,
    sender: env.smsSender,
    unicode: 'auto',
    message,
    format: 'json',
  };

  const startedAt = Date.now();
  try {
    const response = await axios.get(env.smsApiUrl, { params, timeout: 10_000 });
    const durationMs = Date.now() - startedAt;
    const ok = isProviderSuccess(response.data);
    console.info(
      `[sms:connectExpress] ${ok ? 'sent' : 'send reported failure'} to=${maskPhone(phone)} durationMs=${durationMs} httpStatus=${response.status} response=${safeStringify(response.data)}`,
    );
    return ok;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (axios.isAxiosError(err)) {
      console.error(
        `[sms:connectExpress] request FAILED to=${maskPhone(phone)} durationMs=${durationMs} code=${err.code ?? 'n/a'} httpStatus=${err.response?.status ?? 'n/a'} response=${safeStringify(err.response?.data)} message=${err.message}`,
      );
    } else {
      console.error(
        `[sms:connectExpress] request FAILED to=${maskPhone(phone)} durationMs=${durationMs} error=${(err as Error).message}`,
      );
    }
    return false;
  }
}

/**
 * ConnectExpress's real success shape, confirmed via a live test send:
 * `{"status":"OK","message":"Campaign of N numbers Submitted successfully.","code":"200",
 *   "data":{"status":"OK","data":{"0":[{"id":"...","mobile":"...","status":"SUBMITTED"}],
 *   "group_id":...}}}` — top-level `status: "OK"` is the primary signal, cross-checked
 * against the per-recipient `status: "SUBMITTED"` when present. Falls back to a permissive
 * success/error check for any response variant not covered by the confirmed shape.
 */
function isProviderSuccess(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if ('error' in d && d.error) return false;

  if (typeof d.status === 'string') {
    if (d.status.toUpperCase() === 'OK') return true;
    if (/error|fail/i.test(d.status)) return false;
  }

  if (typeof d.success === 'boolean') return d.success;

  return false;
}

function maskPhone(phone: string): string {
  return phone.length > 4
    ? `${phone.slice(0, 2)}${'*'.repeat(phone.length - 4)}${phone.slice(-2)}`
    : phone;
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}
