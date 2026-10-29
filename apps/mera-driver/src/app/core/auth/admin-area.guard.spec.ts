import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '@skylabs-monorepo/shared-auth/angular';
import { adminAreaGuard } from './admin-area.guard';

describe('dedicated portal isolation', () => {
  afterEach(() => TestBed.resetTestingModule());
  it.each([{ profile: { customer: { id: 'own' } }, target: '/customer' }, { profile: { driver: { id: 'own' } }, target: '/driver' }])('redirects a linked portal user to $target', async ({ profile, target }) => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { whenReady: async () => {}, bootstrap: () => profile } }] });
    const result = await TestBed.runInInjectionContext(() => (adminAreaGuard as () => unknown)());
    expect(result).toEqual(TestBed.inject(Router).createUrlTree([target]));
  });
  it('preserves staff access', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { whenReady: async () => {}, bootstrap: () => ({ driver: null, customer: null, roles:[{key:'super_admin'}] }) } }] });
    expect(await TestBed.runInInjectionContext(() => (adminAreaGuard as () => unknown)())).toBe(true);
  });
});
