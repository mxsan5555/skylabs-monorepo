import { HttpError } from '../middleware/errorHandler';

export type DeliveryFailure = 'configuration' | 'network_blocked' | 'timeout' | 'authentication' | 'rate_limit' | 'rejected' | 'unavailable';
/** Static diagnostics only: never attach provider bodies, OTPs, addresses or credentials. */
export function otpDeliveryError(channel: 'SMS' | 'Email', failure: DeliveryFailure): HttpError {
  const errors: Record<DeliveryFailure, [string, string]> = {
    configuration: ['OTP_PROVIDER_NOT_CONFIGURED', `${channel} OTP service is not configured correctly. Contact the administrator.`],
    network_blocked: ['OTP_NETWORK_BLOCKED', `${channel} provider connection is blocked on the server. Contact the administrator.`],
    timeout: ['OTP_PROVIDER_TIMEOUT', `${channel} OTP service timed out. Please try again later.`],
    authentication: ['OTP_PROVIDER_AUTH_FAILED', `${channel} provider rejected the server credentials. Contact the administrator.`],
    rate_limit: ['OTP_PROVIDER_RATE_LIMITED', `${channel} OTP service is temporarily rate-limited. Please try again later.`],
    rejected: ['OTP_PROVIDER_REJECTED', `${channel} provider did not accept the OTP request. Contact the administrator to check provider configuration and account status.`],
    unavailable: ['OTP_DELIVERY_UNAVAILABLE', `${channel} OTP service is unavailable. Please try again later.`],
  };
  const [code, message] = errors[failure];
  return new HttpError(503, code, message);
}

export function transportFailure(code?: string, status?: number): DeliveryFailure {
  if (code === 'EACCES' || code === 'EPERM') return 'network_blocked';
  if (['ECONNABORTED','ETIMEDOUT','ESOCKETTIMEDOUT'].includes(code ?? '')) return 'timeout';
  if (status === 401 || code === 'EAUTH') return 'authentication';
  if (status === 429) return 'rate_limit';
  return status ? 'rejected' : 'unavailable';
}
