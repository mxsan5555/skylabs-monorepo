import { Injectable, computed, signal } from '@angular/core';

const TOKEN_KEY = 'mera_auth_token';

/**
 * App-wide auth state for mera-driver.
 *
 * Holds the bearer token (persisted in localStorage) and exposes it as signals
 * so templates/guards react automatically. The sign-in/otp pages will call
 * signIn(token) once the auth API exists.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _token = signal<string | null>(readToken());

  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);

  signIn(token: string): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
    this._token.set(token);
  }

  signOut(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
    this._token.set(null);
  }
}

function readToken(): string | null {
  return typeof localStorage !== 'undefined'
    ? localStorage.getItem(TOKEN_KEY)
    : null;
}
