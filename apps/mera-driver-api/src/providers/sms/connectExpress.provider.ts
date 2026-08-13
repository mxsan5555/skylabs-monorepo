import axios from 'axios';

/**
 * ConnectExpress SMS gateway — same real request shape as msd-api's provider (method/
 * api_key/to/sender/unicode/message/format as query params). No mock path.
 *
 * Unlike msd-api, there is no DLT-approved template text on record for mera-driver yet, so
 * the message is read from `SMS_OTP_TEMPLATE` (must contain `{otp}`) rather than hardcoded —
 * inventing English OTP copy here risks carrier DLT filtering rejecting an unapproved
 * template. Set `SMS_OTP_TEMPLATE` once mera-driver's own approved text is available.
 */
export async function sendOtp(phone: string, otp: string): Promise<boolean> {
  const apiUrl = process.env.SMS_API_URL ?? '';
  const apiKey = process.env.SMS_API_KEY ?? '';
  const sender = process.env.SMS_SENDER ?? '';
  const template = process.env.SMS_OTP_TEMPLATE ?? '';

  const missing = [
    !apiUrl && 'SMS_API_URL',
    !apiKey && 'SMS_API_KEY',
    !sender && 'SMS_SENDER',
    !template && 'SMS_OTP_TEMPLATE',
  ].filter((v): v is string => !!v);

  if (missing.length > 0) {
    console.error(`[sms:connectExpress] cannot send — missing env var(s): ${missing.join(', ')}`);
    return false;
  }

  if (!template.includes('{otp}')) {
    console.error('[sms:connectExpress] cannot send — SMS_OTP_TEMPLATE does not contain the {otp} placeholder');
    return false;
  }

  const message = template.replace('{otp}', otp);

  const params = {
    method: 'sms',
    api_key: apiKey,
    to: phone,
    sender,
    unicode: 'auto',
    message,
    format: 'json',
  };

  const startedAt = Date.now();
  try {
    const response = await axios.get(apiUrl, { params, timeout: 10_000 });
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

/** Confirmed live against the real ConnectExpress endpoint (see msd-api's provider) — top-level `status: "OK"` is success. */
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
