import { env } from '../env';

interface SmsGatewayResponse {
  status?: string;
  message?: string;
}

/**
 * connectexpress.in has no public API docs; this contract was confirmed live:
 * GET {SMS_API_URL}?api_key=...&method=sms&sender=...&to=<digits, country code, no '+'>&message=...
 * Success: { status: "OK", message, code: "200", data: {...} }
 * Error:   { status: "ERROR", message: "Missing required field: ..." }
 */
export async function sendOtpSms(to: string, code: string): Promise<void> {
 const message = `Your overseas education lane registration OTP is ${code}`;

  if (!env.smsApiKey) {
    if (env.isProduction) throw new Error('SMS gateway is not configured');
    // Dev fallback so the OTP flow is testable without spending SMS credits — never reached in prod.
    console.log(`[dev] OTP SMS to ${to}: ${code}`);
    return;
  }

  const params = new URLSearchParams({
    api_key: env.smsApiKey,
    method: 'sms',
    sender: env.smsSender,
    to: to.replace(/^\+/, ''),
    message,
  });

  const res = await fetch(`${env.smsApiUrl}?${params.toString()}`);
  const data = (await res.json().catch(() => null)) as SmsGatewayResponse | null;

  if (!res.ok || data?.status !== 'OK') {
    throw new Error(`SMS gateway error: ${data?.message ?? res.statusText}`);
  }
}
