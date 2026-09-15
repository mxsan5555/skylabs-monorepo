/**
 * Guard/directive coverage for `@skylabs-monorepo/shared-auth/angular`'s `authGuard`,
 * `permissionGuard`, and `HasPermissionDirective`.
 *
 * These live here (in mera-driver) rather than in `packages/shared-auth` because
 * `shared-auth`'s own test target (`@nx/vitest:test`, see its `project.json`) has no
 * Angular compiler/TestBed wiring — it's a plain Vite/Vitest lib target with no
 * `@angular/build` integration, so `TestBed.configureTestingModule` + a real
 * `@Directive`/template can't compile there. mera-driver's `test` target
 * (`@angular/build:unit-test`) already has full Angular TestBed support (see
 * `app.spec.ts`), and it depends on shared-auth for real, so exercising the actual
 * exported guard/directive functions here is a faithful test of the code every
 * route in this app relies on. If shared-auth grows its own Angular test
 * infrastructure later, these are the specs to port over — nothing here is
 * mera-driver-specific except the injection setup.
 */
import { TestBed } from '@angular/core/testing';
import { Component, signal, type WritableSignal } from '@angular/core';
import { Router, provideRouter, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { vi } from 'vitest';
import type { PermissionAction } from '@skylabs-monorepo/shared-types';
import { AUTH_CONFIG, AuthService, authGuard, permissionGuard, HasPermissionDirective } from '@skylabs-monorepo/shared-auth/angular';

describe('authGuard', () => {
  function configure(isAuthenticated: boolean, sessionExpired = false) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => isAuthenticated, whenReady: () => Promise.resolve(), sessionExpired: () => sessionExpired },
        },
      ],
    });
  }

  it('redirects to /sign-in with a redirectTo query param when the caller is not authenticated', async () => {
    configure(false);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/account/dashboard' } as RouterStateSnapshot),
    );
    const router = TestBed.inject(Router);
    expect(result).toEqual(router.createUrlTree(['/sign-in'], { queryParams: { redirectTo: '/account/dashboard' } }));
  });

  it('adds sessionExpired=1 when the session ended involuntarily (dead refresh token), not on a fresh unauthenticated visit', async () => {
    configure(false, true);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/driver' } as RouterStateSnapshot),
    );
    const router = TestBed.inject(Router);
    expect(result).toEqual(
      router.createUrlTree(['/sign-in'], { queryParams: { redirectTo: '/driver', sessionExpired: 1 } }),
    );
  });

  it('allows navigation when the caller is authenticated', async () => {
    configure(true);
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/account/dashboard' } as RouterStateSnapshot),
    );
    expect(result).toBe(true);
  });

  it('awaits whenReady() before checking isAuthenticated (does not let a not-yet-resolved session through)', async () => {
    let resolveReady!: () => void;
    let isAuthenticated = false; // still "no" at the moment whenReady() is pending
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => isAuthenticated,
            whenReady: () => new Promise<void>((resolve) => (resolveReady = resolve)),
          },
        },
      ],
    });

    const resultPromise = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/driver' } as RouterStateSnapshot),
    );
    isAuthenticated = true; // the session recovers while whenReady() is still pending
    resolveReady();
    const result = await resultPromise;

    expect(result).toBe(true);
  });
});

describe('permissionGuard', () => {
  function configure(can: boolean, whenReady: () => Promise<void> = () => Promise.resolve()) {
    const authMock = { can: vi.fn().mockReturnValue(can), whenReady: vi.fn(whenReady) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        { provide: AUTH_CONFIG, useValue: { appPrefix: 'test', apiBaseUrl: 'http://api.test' } },
      ],
    });
    return authMock;
  }

  it('allows navigation when the route carries no `data.permission` at all', async () => {
    configure(false);
    const route = { data: {} } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => permissionGuard(route, {} as RouterStateSnapshot));
    expect(result).toBe(true);
  });

  it('redirects to /account/profile when the caller lacks the required permission', async () => {
    configure(false);
    const route = { data: { permission: { menuKey: 'rbac.roles', action: 'view' } } } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => permissionGuard(route, {} as RouterStateSnapshot));
    const router = TestBed.inject(Router);
    expect(result).toEqual(router.createUrlTree(['/account/profile']));
  });

  it('allows navigation when the caller has the permission, defaulting the action to "view"', async () => {
    const authMock = configure(true);
    const route = { data: { permission: { menuKey: 'rbac.roles' } } } as unknown as ActivatedRouteSnapshot;
    const result = await TestBed.runInInjectionContext(() => permissionGuard(route, {} as RouterStateSnapshot));
    expect(result).toBe(true);
    expect(authMock.can).toHaveBeenCalledWith('rbac.roles', 'view');
  });

  it('awaits whenReady() before checking permissions (does not false-deny while bootstrap is still loading)', async () => {
    let resolveReady!: () => void;
    const authMock = configure(true, () => new Promise<void>((resolve) => (resolveReady = resolve)));
    const route = { data: { permission: { menuKey: 'rbac.roles' } } } as unknown as ActivatedRouteSnapshot;

    const resultPromise = TestBed.runInInjectionContext(() => permissionGuard(route, {} as RouterStateSnapshot));
    // `can()` must not be consulted yet — whenReady() hasn't resolved.
    expect(authMock.can).not.toHaveBeenCalled();

    resolveReady();
    const result = await resultPromise;

    expect(result).toBe(true);
    expect(authMock.can).toHaveBeenCalledWith('rbac.roles', 'view');
  });
});

@Component({
  standalone: true,
  imports: [HasPermissionDirective],
  template: `<div *appHasPermission="permission()" class="guarded">secret</div>`,
})
class HasPermissionHost {
  readonly permission = signal<{ menuKey: string; action?: PermissionAction }>({ menuKey: 'rbac.roles', action: 'view' });
}

describe('HasPermissionDirective', () => {
  // `HasPermissionDirective`'s effect() only has a reactive dependency because the
  // *real* `AuthService.can()` reads the `bootstrap` signal internally — a plain
  // `vi.fn().mockReturnValue(...)` has no signal read, so it would never re-run.
  // Backing the mock with a signal (`grantedSignal`) reproduces that real dependency
  // so the "reacts to a later change" case is actually exercising the directive's
  // reactivity, not just its one-time initial render.
  async function setup(initialCan: boolean) {
    const grantedSignal: WritableSignal<boolean> = signal(initialCan);
    const authMock = { can: vi.fn(() => grantedSignal()) };
    await TestBed.configureTestingModule({
      imports: [HasPermissionHost],
      providers: [{ provide: AuthService, useValue: authMock }],
    }).compileComponents();

    const fixture = TestBed.createComponent(HasPermissionHost);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, authMock, grantedSignal };
  }

  it('renders the embedded view when AuthService.can() grants the permission', async () => {
    const { fixture, authMock } = await setup(true);
    expect(authMock.can).toHaveBeenCalledWith('rbac.roles', 'view');
    expect(fixture.nativeElement.querySelector('.guarded')).not.toBeNull();
  });

  it('does not render the embedded view when AuthService.can() denies the permission', async () => {
    const { fixture } = await setup(false);
    expect(fixture.nativeElement.querySelector('.guarded')).toBeNull();
  });

  it('reacts to a later permission change (e.g. bootstrap refresh after "Login As")', async () => {
    const { fixture, grantedSignal } = await setup(false);
    expect(fixture.nativeElement.querySelector('.guarded')).toBeNull();

    grantedSignal.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.guarded')).not.toBeNull();
  });
});
