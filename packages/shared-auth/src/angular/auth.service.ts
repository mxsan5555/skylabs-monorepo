import { Injectable, computed, inject, signal } from '@angular/core';
import type { BootstrapResponse, PermissionAction } from '@skylabs-monorepo/shared-types';
import { can as canPermission } from '@skylabs-monorepo/shared-permissions';
import {
  AuthRequestError,
  authStorageKeys,
  fetchBootstrap,
  isJwtExpired,
  isPreviewToken,
  msUntilJwtExpiry,
  readStorageValue,
  refreshAccessToken,
  writeStorageValue,
} from '../index';
import { AUTH_CONFIG } from './auth-config';

/** One retry, after a short delay, for a bootstrap fetch that failed for a reason other than
 *  a genuine 401/403 (network blip, 5xx, proxy hiccup) — so a transient failure right after
 *  sign-in doesn't leave `bootstrap` permanently null and fool `permissionGuard`/
 *  `driverPortalGuard` into treating "the request failed" as "access denied". */
const BOOTSTRAP_RETRY_DELAY_MS = 800;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(AUTH_CONFIG);
  private readonly keys = authStorageKeys(this.config.appPrefix);

  private readonly _token = signal<string | null>(readStorageValue(this.keys.token));
  private readonly _bootstrap = signal<BootstrapResponse | null>(null);
  private readonly _loading = signal<boolean>(!!readStorageValue(this.keys.token));

  /** True once a session that was previously live ends involuntarily (a dead refresh token,
   *  or a 401/403 on bootstrap) — as opposed to a deliberate `signOut()`. `authGuard` reads
   *  this to show a "your session expired" message rather than a bare sign-in form. Reset on
   *  the next successful `signIn()`. */
  private readonly _sessionExpired = signal(false);

  readonly token = this._token.asReadonly();
  readonly bootstrap = this._bootstrap.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);
  readonly isPreviewing = computed(() => !!this._bootstrap()?.preview?.isPreview);
  readonly sessionExpired = this._sessionExpired.asReadonly();

  /** Proactive renewal timer — fires ~60s before the current access token's claimed expiry. */
  private refreshTimer?: ReturnType<typeof setTimeout>;
  /** Single-flight guard: concurrent callers (the proactive timer and any number of
   *  interceptor-triggered 401s) share this one in-flight refresh instead of each starting
   *  their own — avoiding a refresh-token replay/rotation race that would fail everyone but
   *  the first caller (see `rotateRefreshToken`'s replay-detection on the backend). */
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    const token = this._token();
    const storedRefreshToken = readStorageValue(this.keys.refreshToken);

    if (token && !isJwtExpired(token)) {
      void this.loadBootstrap(token);
      this.scheduleRefresh(token);
    } else if (token && storedRefreshToken && !isPreviewToken(token)) {
      // The access token has expired (e.g. the tab was reopened, or the laptop slept through
      // the proactive timer) but we hold a refresh token — recover transparently instead of
      // leaving a "token present but bootstrap never loads" zombie session that every
      // permission/ownership guard would then read as "no access" (this was the repeated-
      // logout bug: guards said no with no way for the user to recover short of clearing
      // storage by hand, since nothing ever re-attempted auth or cleared the dead token).
      this._loading.set(true);
      void this.ensureValidToken({ force: true }).then((refreshed) => {
        if (!refreshed) return; // ensureValidToken already cleared the session on failure
        void this.loadBootstrap(refreshed);
      });
    } else if (token) {
      // No usable refresh token — this is a genuine expired session, not a transient failure.
      this.clearSession('expired');
    } else {
      this._loading.set(false);
    }
  }

  private async loadBootstrap(token: string, attempt = 1): Promise<void> {
    this._loading.set(true);
    try {
      const data = await fetchBootstrap(this.config.apiBaseUrl, token);
      this._bootstrap.set(data);
      this._loading.set(false);
    } catch (err) {
      const status = err instanceof AuthRequestError ? err.status : undefined;
      // Only a genuine auth failure (401/403) is a real "session ended" — sign out. A network
      // blip, 5xx, or other transient failure must not clear an otherwise-valid token (same fix
      // as the React AuthProvider's loadBootstrap).
      if (status === 401 || status === 403) {
        this.clearSession('expired');
        return;
      }
      if (attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
        await this.loadBootstrap(token, attempt + 1);
        return;
      }
      // Both attempts failed transiently — leave the token and any previously-loaded
      // bootstrap alone (do NOT clear a valid session over a flaky network), just stop loading.
      this._loading.set(false);
    }
  }

  /** Clears the timer, storage, and in-memory state — the one place a session actually ends.
   *  Pass `'expired'` only for an involuntary end (dead refresh token, 401/403) — never for
   *  `signOut()`, which is the user's own choice and shouldn't show a "session expired"
   *  message on their next visit to the sign-in screen. */
  private clearSession(reason?: 'expired'): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.refreshPromise = null;
    writeStorageValue(this.keys.token, null);
    writeStorageValue(this.keys.refreshToken, null);
    this._bootstrap.set(null);
    this._token.set(null);
    this._loading.set(false);
    if (reason === 'expired') this._sessionExpired.set(true);
  }

  /** Schedules the proactive renewal ~60s before `token`'s claimed expiry. Never armed for a
   *  preview ("Login As") token — those are fixed-lifetime by design (see CLAUDE.md's Login As
   *  section) and have no refresh token of their own to use. */
  private scheduleRefresh(token: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (isPreviewToken(token)) return;
    const delay = msUntilJwtExpiry(token);
    this.refreshTimer = setTimeout(() => void this.ensureValidToken({ force: true }), delay);
  }

  /**
   * Returns a token guaranteed usable right now: the current one if it's not close to expiry,
   * or a freshly-rotated one via the stored refresh token. `force: true` always rotates
   * (used by the proactive timer, and by the HTTP interceptor after a live 401 — the token
   * wasn't expired by its own claim, but the server just rejected it, so trust the server).
   * Concurrent callers share one in-flight rotation (single-flight) rather than each racing
   * `POST /auth/refresh` — the backend's rotation treats a second presentation of an
   * already-rotated refresh token as a replay and revokes the whole session chain, so a race
   * here would log the user out even though the first refresh actually succeeded.
   * Returns `null` (and clears the session) only when the refresh token itself is genuinely
   * invalid, expired, or revoked — never for a network blip.
   */
  async ensureValidToken(opts: { force?: boolean } = {}): Promise<string | null> {
    const token = this._token();
    if (!token) return null;
    if (isPreviewToken(token)) return token; // never refreshed
    if (!opts.force && !isJwtExpired(token) && msUntilJwtExpiry(token) > 0) return token;

    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<string | null> {
    const storedRefreshToken = readStorageValue(this.keys.refreshToken);
    if (!storedRefreshToken) {
      this.clearSession('expired');
      return null;
    }
    try {
      const rotated = await refreshAccessToken(this.config.apiBaseUrl, storedRefreshToken);
      writeStorageValue(this.keys.token, rotated.accessToken);
      writeStorageValue(this.keys.refreshToken, rotated.refreshToken);
      this._token.set(rotated.accessToken);
      this.scheduleRefresh(rotated.accessToken);
      return rotated.accessToken;
    } catch (err) {
      // Only a genuine rejection (401 — invalid/expired/revoked refresh token) ends the
      // session. A network blip trying to reach `/auth/refresh` must not log the user out;
      // the proactive timer / next interceptor-triggered call will simply try again.
      const status = err instanceof AuthRequestError ? err.status : undefined;
      if (status === 401) {
        this.clearSession('expired');
      }
      return null;
    }
  }

  async signIn(token: string, refreshToken?: string): Promise<void> {
    writeStorageValue(this.keys.token, token);
    writeStorageValue(this.keys.refreshToken, refreshToken ?? null);
    this._token.set(token);
    this._sessionExpired.set(false);
    this.scheduleRefresh(token);
    await this.loadBootstrap(token);
  }

  /** Clears the local session immediately (so the UI never waits on the network), then best-
   *  effort revokes the refresh session server-side. Safe to call with no refresh token stored
   *  (nothing to revoke — just clears local state). */
  signOut(): void {
    const storedRefreshToken = readStorageValue(this.keys.refreshToken);
    const apiBaseUrl = this.config.apiBaseUrl;
    this.clearSession();
    writeStorageValue(this.keys.realToken, null);
    if (storedRefreshToken) {
      fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
        keepalive: true,
      }).catch(() => undefined);
    }
  }

  async refreshBootstrap(): Promise<void> {
    const token = this._token();
    if (token) await this.loadBootstrap(token);
  }

  /** Resolves once the initial bootstrap fetch (if any) has settled. Guards await this
   *  before checking `can()` — on a hard page load, `_loading` starts `true` and the
   *  permission set isn't populated yet; checking synchronously would false-deny. */
  async whenReady(): Promise<void> {
    if (!this._loading()) return;
    await new Promise<void>((resolve) => {
      const check = () => (this._loading() ? setTimeout(check, 20) : resolve());
      check();
    });
  }

  async loginAsUser(targetUserId: string): Promise<void> {
    const token = this._token();
    if (!token) return;
    const res = await fetch(`${this.config.apiBaseUrl}/rbac/impersonate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetUserId }),
    });
    if (!res.ok) throw new Error(`Failed to start preview: ${res.status}`);
    const body = (await res.json()) as { data: { previewToken: string } };
    // The preview token is fixed-lifetime and never refreshed — stop any timer armed for the
    // real (super admin) token while it's dormant; `returnToSuperAdmin` re-arms it.
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    writeStorageValue(this.keys.realToken, token);
    writeStorageValue(this.keys.token, body.data.previewToken);
    this._token.set(body.data.previewToken);
    await this.loadBootstrap(body.data.previewToken);
  }

  async returnToSuperAdmin(): Promise<void> {
    const realToken = readStorageValue(this.keys.realToken);
    if (!realToken) return;
    writeStorageValue(this.keys.realToken, null);
    writeStorageValue(this.keys.token, realToken);
    this._token.set(realToken);
    // The real token may itself have expired while previewing (the preview session has no
    // fixed relation to the real token's 15-minute TTL) — if so, use the refresh token that's
    // been sitting untouched in storage the whole time to recover it transparently.
    if (isJwtExpired(realToken)) {
      const refreshed = await this.ensureValidToken({ force: true });
      if (refreshed) await this.loadBootstrap(refreshed);
      return;
    }
    this.scheduleRefresh(realToken);
    await this.loadBootstrap(realToken);
  }

  can(menuKey: string, action: PermissionAction = 'view'): boolean {
    return canPermission(this._bootstrap()?.permissions ?? [], menuKey, action);
  }
}
