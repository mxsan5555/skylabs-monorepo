import { Injectable, computed, signal } from '@angular/core';
import type { UserRole } from '../../models';

const TOKEN_KEY = 'mera_auth_token';
const ROLES_KEY = 'mera_auth_roles';

/**
 * App-wide auth state for mera-driver: bearer token + the user's access roles.
 *
 * Roles will come from the backend JWT; until then they're stored locally and
 * can be swapped via the sidebar "View as" switcher to preview each persona.
 * Guards and the menu read `roles`; the backend must re-check roles per request.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _token = signal<string | null>(readToken());
  private readonly _roles = signal<UserRole[]>(readRoles());

  readonly token = this._token.asReadonly();
  readonly roles = this._roles.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);

  signIn(token: string): void {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
    this._token.set(token);
  }

  signOut(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
    this._token.set(null);
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
