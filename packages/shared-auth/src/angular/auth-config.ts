import { InjectionToken, type Provider } from '@angular/core';

export interface AuthConfig {
  /** e.g. 'mera_driver' — used to namespace localStorage keys for this app only. */
  appPrefix: string;
  apiBaseUrl: string;
  /** Where `permissionGuard` sends a denied navigation. Defaults to '/account/profile'
   *  (the original behavior) if not set, so existing consumers are unaffected. */
  unauthorizedRedirectPath?: string;
}

export const AUTH_CONFIG = new InjectionToken<AuthConfig>('AUTH_CONFIG');

export function provideSharedAuth(config: AuthConfig): Provider[] {
  return [{ provide: AUTH_CONFIG, useValue: config }];
}
