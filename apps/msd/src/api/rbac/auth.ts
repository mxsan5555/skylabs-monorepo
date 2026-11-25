import { apiPost } from './client';

export type OtpPurpose = 'login' | 'signup' | 'change_phone' | 'change_email';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
}

export interface AuthTokensResponse {
  accessToken: string;
  user: AuthUser;
}

/** `POST /auth/otp/request` — always succeeds (no user-enumeration) whether or not the identifier has an account. */
export function requestOtp(identifier: string, purpose: OtpPurpose = 'login') {
  return apiPost<{ message: string }>('/auth/otp/request', null, { identifier, purpose });
}

/** `POST /auth/otp/verify` — verifies the code and logs in; the refresh token is an HttpOnly cookie. */
export function verifyOtp(identifier: string, otp: string) {
  return apiPost<AuthTokensResponse>('/auth/otp/verify', null, { identifier, otp });
}

/** Full URL to kick off the Google OAuth redirect flow (not a fetch — used as a link href). */
export function googleSignInUrl(apiBaseUrl: string, returnTo?: string | null): string {
  const url = new URL(`${apiBaseUrl}/auth/google`);
  if (returnTo) url.searchParams.set('next', returnTo);
  return url.toString();
}
