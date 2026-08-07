import { Injectable, computed, inject, signal } from '@angular/core';
import type { BootstrapResponse, PermissionAction } from '@skylabs-monorepo/shared-types';
import { can as canPermission } from '@skylabs-monorepo/shared-permissions';
import {
  authStorageKeys,
  fetchBootstrap,
  isJwtExpired,
  readStorageValue,
  writeStorageValue,
} from '../index';
import { AUTH_CONFIG } from './auth-config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(AUTH_CONFIG);
  private readonly keys = authStorageKeys(this.config.appPrefix);

  private readonly _token = signal<string | null>(readStorageValue(this.keys.token));
  private readonly _bootstrap = signal<BootstrapResponse | null>(null);
  private readonly _loading = signal<boolean>(!!readStorageValue(this.keys.token));

  readonly token = this._token.asReadonly();
  readonly bootstrap = this._bootstrap.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);
  readonly isPreviewing = computed(() => !!this._bootstrap()?.preview?.isPreview);

  constructor() {
    const token = this._token();
    if (token && !isJwtExpired(token)) {
      void this.loadBootstrap(token);
    } else {
      this._loading.set(false);
    }
  }

  private async loadBootstrap(token: string): Promise<void> {
    this._loading.set(true);
    try {
      const data = await fetchBootstrap(this.config.apiBaseUrl, token);
      this._bootstrap.set(data);
    } catch {
      this._bootstrap.set(null);
      this._token.set(null);
      writeStorageValue(this.keys.token, null);
    } finally {
      this._loading.set(false);
    }
  }

  async signIn(token: string): Promise<void> {
    writeStorageValue(this.keys.token, token);
    this._token.set(token);
    await this.loadBootstrap(token);
  }

  signOut(): void {
    writeStorageValue(this.keys.token, null);
    writeStorageValue(this.keys.realToken, null);
    this._token.set(null);
    this._bootstrap.set(null);
  }

  async refreshBootstrap(): Promise<void> {
    const token = this._token();
    if (token) await this.loadBootstrap(token);
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
    await this.loadBootstrap(realToken);
  }

  can(menuKey: string, action: PermissionAction = 'view'): boolean {
    return canPermission(this._bootstrap()?.permissions ?? [], menuKey, action);
  }
}
