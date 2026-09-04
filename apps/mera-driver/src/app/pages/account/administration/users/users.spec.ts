import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { of } from 'rxjs';
import type { Role, User } from '@skylabs-monorepo/shared-types';
import { AuthService, provideSharedAuth } from '@skylabs-monorepo/shared-auth/angular';
import { AdministrationUsers } from './users';
import { RbacApiService } from '../../../../core/rbac/rbac-api.service';

const ROLE_DRIVER: Role = {
  id: 'role-driver',
  key: 'driver',
  name: 'Driver',
  isSystem: true,
  isSuperAdmin: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const USER_A: User & { roles: { role: Role }[] } = {
  id: 'user-a',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  roles: [{ role: ROLE_DRIVER }],
};

function buildRbacApiMock() {
  return {
    listUsers: () => of({ items: [USER_A], total: 1, page: 1, pageSize: 100 }),
    listRoles: () => of([ROLE_DRIVER]),
  } as unknown as RbacApiService;
}

async function setup(canAssignImpersonation: boolean) {
  const authMock = {
    can: vi.fn(() => canAssignImpersonation),
    loginAsUser: vi.fn().mockResolvedValue(undefined),
  };

  await TestBed.configureTestingModule({
    imports: [AdministrationUsers],
    providers: [
      provideSharedAuth({ appPrefix: 'test_mera_driver', apiBaseUrl: 'http://localhost/api' }),
      provideRouter([]),
      { provide: RbacApiService, useValue: buildRbacApiMock() },
      { provide: AuthService, useValue: authMock },
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
  }).compileComponents();

  const fixture: ComponentFixture<AdministrationUsers> = TestBed.createComponent(AdministrationUsers);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, authMock };
}

describe('AdministrationUsers — "Login As" gating', () => {
  it('checks the exact rbac.users:assign permission action to decide canLoginAs', async () => {
    const { component, authMock } = await setup(true);

    // canLoginAs is a computed signal — read it to trigger evaluation.
    expect(component['canLoginAs']()).toBe(true);
    expect(authMock.can).toHaveBeenCalledWith('rbac.users', 'assign');
  });

  it('hides "Login as this user" in the DOM when the caller lacks rbac.users:assign', async () => {
    const { fixture, component } = await setup(false);
    component['selectUser'](USER_A.id);
    fixture.detectChanges();

    expect(component['canLoginAs']()).toBe(false);
    const button = Array.from(fixture.nativeElement.querySelectorAll('md-filled-tonal-button')).find((el) =>
      (el as HTMLElement).textContent?.includes('Login as this user'),
    );
    expect(button).toBeUndefined();
  });

  it('shows "Login as this user" in the DOM when the caller holds rbac.users:assign', async () => {
    const { fixture, component } = await setup(true);
    component['selectUser'](USER_A.id);
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('md-filled-tonal-button')).find((el) =>
      (el as HTMLElement).textContent?.includes('Login as this user'),
    );
    expect(button).toBeDefined();
  });

  it('calls AuthService.loginAsUser with the selected user id and navigates to the dashboard', async () => {
    const { component, authMock } = await setup(true);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component['selectUser'](USER_A.id);
    await component['loginAsUser']();

    expect(authMock.loginAsUser).toHaveBeenCalledWith(USER_A.id);
    expect(navigateSpy).toHaveBeenCalledWith(['/account/dashboard']);
  });

  it('surfaces an error and does not navigate when loginAsUser rejects', async () => {
    const { component, authMock } = await setup(true);
    authMock.loginAsUser.mockRejectedValueOnce(new Error('preview failed'));
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component['selectUser'](USER_A.id);
    await component['loginAsUser']();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component['detailError']()).toMatch(/Failed to start "Login As" preview/);
  });

  it('does nothing when loginAsUser is invoked with no selected user', async () => {
    const { component, authMock } = await setup(true);
    await component['loginAsUser']();
    expect(authMock.loginAsUser).not.toHaveBeenCalled();
  });
});
