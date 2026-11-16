import { computed, inject, Injectable, signal } from '@angular/core';
import { AUTH_CONFIG, AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { authStorageKeys, readStorageValue } from '@skylabs-monorepo/shared-auth';
import { can } from '@skylabs-monorepo/shared-permissions';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';

/** Reuse shared authentication while fencing async bootstrap/renewal results to a session. */
@Injectable()
export class MeraAuthService extends AuthService {
  private readonly configForSession = inject(AUTH_CONFIG);
  private readonly sessionReady = signal(true);
  private readonly expectedAccount = signal<string | null>(null);
  private sessionEpoch = 0;
  get sessionVersion(): number { return this.sessionEpoch; }
  private credentials: {token: string; refreshToken?: string} | null = null;

  constructor() {
    super();
    this.rememberCurrentSession();
    const sharedBootstrap = this.bootstrap;
    const accountBootstrap = computed(() => {
      const data = sharedBootstrap(), token = this.token(), account = this.expectedAccount();
      return data && token && this.sessionReady() && account && this.subject(token) === account && data.user.id === account ? data : null;
    });
    Object.defineProperty(this, 'bootstrap', { value: accountBootstrap });
    Object.defineProperty(this, 'isPreviewing', { value: computed(() => !!accountBootstrap()?.preview?.isPreview) });
  }

  private subject(token: string | null): string | null {
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null; }
    catch { return null; }
  }

  private rememberCurrentSession(): void {
    const token = this.token();
    this.expectedAccount.set(this.subject(token));
    this.credentials = token ? {token, refreshToken: readStorageValue(authStorageKeys(this.configForSession.appPrefix).refreshToken) ?? undefined} : null;
  }

  /** A shared request may finish after logout or account switching; restore the current
   * session through its existing lifecycle, never through the old request's credentials. */
  private async recoverCurrentSession(epoch: number): Promise<void> {
    if (epoch === this.sessionEpoch) return;
    const currentEpoch = this.sessionEpoch, current = this.credentials;
    if (!current) { super.signOut(); return; }
    await super.signIn(current.token, current.refreshToken);
    if (currentEpoch !== this.sessionEpoch) await this.recoverCurrentSession(currentEpoch);
  }

  override async signIn(token: string, refreshToken?: string): Promise<void> {
    const epoch = ++this.sessionEpoch;
    this.credentials = {token, refreshToken};
    this.expectedAccount.set(this.subject(token));
    this.sessionReady.set(false);
    await super.signIn(token, refreshToken);
    if (epoch === this.sessionEpoch) this.sessionReady.set(true);
    else await this.recoverCurrentSession(epoch);
  }

  override signOut(): void {
    ++this.sessionEpoch;
    this.sessionReady.set(false); this.expectedAccount.set(null); this.credentials = null;
    super.signOut();
  }

  override async ensureValidToken(opts: {force?: boolean} = {}): Promise<string | null> {
    // The base constructor can invoke renewal before subclass fields initialise.
    const epoch = this.sessionEpoch ?? 0;
    const token = await super.ensureValidToken(opts);
    if (epoch !== this.sessionEpoch) { await this.recoverCurrentSession(epoch); return this.token(); }
    if (token) this.rememberCurrentSession();
    return token;
  }

  override async refreshBootstrap(): Promise<void> {
    const epoch = this.sessionEpoch;
    await super.refreshBootstrap();
    await this.recoverCurrentSession(epoch);
  }

  override async loginAsUser(userId: string): Promise<void> {
    const epoch = ++this.sessionEpoch;
    this.sessionReady.set(false);
    try {
      await super.loginAsUser(userId);
      if (epoch === this.sessionEpoch) this.rememberCurrentSession();
      else await this.recoverCurrentSession(epoch);
    } finally { if (epoch === this.sessionEpoch) this.sessionReady.set(true); }
  }

  override async returnToSuperAdmin(): Promise<void> {
    const epoch = ++this.sessionEpoch;
    this.sessionReady.set(false);
    try {
      await super.returnToSuperAdmin();
      if (epoch === this.sessionEpoch) this.rememberCurrentSession();
      else await this.recoverCurrentSession(epoch);
    } finally { if (epoch === this.sessionEpoch) this.sessionReady.set(true); }
  }

  override can(menuKey: string, action: PermissionAction = 'view'): boolean {
    return can(this.bootstrap()?.permissions ?? [], menuKey, action);
  }
}
