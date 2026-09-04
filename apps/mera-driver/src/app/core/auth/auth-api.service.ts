import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';
import { environment } from '../../../environments/environment';

export type OtpPurpose = 'login' | 'signup' | 'change_phone' | 'change_email';

export interface OtpVerifyResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string | null; phone: string | null; roles: string[] };
}

/**
 * The one slice of mera-driver-api's auth surface the shared AuthService doesn't
 * own: requesting/verifying an OTP. (Token storage, /rbac/bootstrap, and the
 * "Login As" flow all live in `@skylabs-monorepo/shared-auth/angular`'s
 * AuthService — this service only talks to `POST /auth/otp/*`.)
 *
 * mera-driver-api mounts its routes directly at the root (no `/api/v1` prefix),
 * so every call here is `${apiUrl}/auth/...`.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth`;

  requestOtp(identifier: string, purpose: OtpPurpose = 'login'): Observable<{ message: string }> {
    return this.http
      .post<ApiEnvelope<{ message: string }>>(`${this.base}/otp/request`, { identifier, purpose })
      .pipe(map(unwrap));
  }

  verifyOtp(identifier: string, otp: string, purpose: OtpPurpose = 'login'): Observable<OtpVerifyResult> {
    return this.http
      .post<ApiEnvelope<OtpVerifyResult>>(`${this.base}/otp/verify`, { identifier, otp, purpose })
      .pipe(map(unwrap));
  }

  /** Full-page redirect target for "Continue with Google" — the API itself starts the OAuth handshake. */
  googleSignInUrl(): string {
    return `${this.base}/google`;
  }
}

function unwrap<T>(res: ApiEnvelope<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
