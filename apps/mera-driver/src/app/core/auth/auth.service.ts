import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { User, UserRole } from '../../models';
import { ApiClient } from '../api/api-client.service';

const TOKEN_KEY = 'mera_auth_token';
const ROLES_KEY = 'mera_auth_roles';

/**
 * App-wide auth state for mera-driver: bearer token, roles, and the signed-in user.
 *
 * `signIn` receives roles + user straight from mera-driver-api's OTP-verify/exchange
 * response; `roles` is also refreshed from `GET /me` on boot. The sidebar's
 * "View as" switcher (setRoles) can still override roles locally to preview a
 * persona — guards and the menu read `roles` either way, but mera-driver-api
 * re-checks the real role from the JWT on every request, so the switcher
 * cannot grant real access, only change what the UI shows.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);

  private readonly _token = signal<string | null>(readToken());
  private readonly _roles = signal<UserRole[]>(readRoles());
  private readonly _user = signal<User | null>(null);

  readonly token = this._token.asReadonly();
  readonly roles = this._roles.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);

  constructor() {
    // Rehydrate the user profile (and confirm roles are current) on app boot,
    // since only the token — not the user object — survives a page reload.
    effect((onCleanup) => {
      const token = this._token();
      if (!token) return;

      let cancelled = false;
      const sub = this.api.get<User>('/me').subscribe({
        next: (freshUser) => {
          if (cancelled) return;
          this._user.set(freshUser);
          this.setRoles(freshUser.roles);
        },
        error: () => {
          // Invalid/expired token — drop the stale session rather than leave a
          // token that guards will treat as authenticated but /me rejects.
          if (!cancelled) this.signOut();
        },
      });

      onCleanup(() => {
        cancelled = true;
        sub.unsubscribe();
      });
    });
  }

  signIn(token: string, roles: UserRole[], user: User): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
    this._token.set(token);
    this.setRoles(roles);
    this._user.set(user);
  }

  signOut(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
    this._token.set(null);
    this._user.set(null);
  }

  setRoles(roles: UserRole[]): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
    }
    this._roles.set(roles);
  }

  hasRole(allowed: UserRole[]): boolean {
    return allowed.some((r) => this._roles().includes(r));
  }
}

function readToken(): string | null {
  return typeof localStorage !== 'undefined'
    ? localStorage.getItem(TOKEN_KEY)
    : null;
}

function readRoles(): UserRole[] {
  if (typeof localStorage === 'undefined') return ['customer'];
  try {
    const raw = localStorage.getItem(ROLES_KEY);
    return raw ? (JSON.parse(raw) as UserRole[]) : ['customer'];
  } catch {
    return ['customer'];
  }
}
