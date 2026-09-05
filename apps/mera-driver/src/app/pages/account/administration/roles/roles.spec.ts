import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import type { Role } from '@skylabs-monorepo/shared-types';
import { provideSharedAuth } from '@skylabs-monorepo/shared-auth/angular';
import { AdministrationRoles } from './roles';
import { RbacApiService, type PermissionCatalogNode } from '../../../../core/rbac/rbac-api.service';

const ROLE_A: Role = {
  id: 'role-a',
  key: 'fleet_manager',
  name: 'Fleet Manager',
  isSystem: false,
  isSuperAdmin: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Matches `PermissionCatalogNode[]` returned by GET /rbac/permissions/catalog — one node
// per menu item, every action listed, `permissionId` real or `null` if unseeded.
const CATALOG: PermissionCatalogNode[] = [
  {
    menuKey: 'drivers',
    title: 'Drivers',
    actions: [
      { action: 'view', key: 'drivers:view', permissionId: 'perm-view-id', label: 'Drivers — view' },
      { action: 'edit', key: 'drivers:edit', permissionId: 'perm-edit-id', label: 'Drivers — edit' },
      // Not seeded for this node — must be filtered out of the renderable matrix.
      { action: 'delete', key: 'drivers:delete', permissionId: null, label: 'Drivers — delete' },
    ],
  },
];

function buildRbacApiMock(overrides: Partial<Record<keyof RbacApiService, unknown>> = {}) {
  return {
    listRoles: () => of([ROLE_A]),
    permissionsCatalog: () => of(CATALOG),
    rolePermissionIds: () => of([]),
    listDashboardWidgets: () => of([]),
    setRolePermissions: () => of({}),
    setRoleWidgets: () => of([]),
    createRole: () => of(ROLE_A),
    cloneRole: () => of(ROLE_A),
    setRoleStatus: () => of(ROLE_A),
    deleteRole: () => of({ id: ROLE_A.id }),
    ...overrides,
  } as unknown as RbacApiService;
}

async function setup(rbacMock: RbacApiService) {
  await TestBed.configureTestingModule({
    imports: [AdministrationRoles],
    providers: [
      provideSharedAuth({ appPrefix: 'test_mera_driver', apiBaseUrl: 'http://localhost/api' }),
      { provide: RbacApiService, useValue: rbacMock },
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
  }).compileComponents();

  const fixture: ComponentFixture<AdministrationRoles> = TestBed.createComponent(AdministrationRoles);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component };
}

describe('AdministrationRoles', () => {
  it('should create and load the role list + permission catalog on init', async () => {
    const rbac = buildRbacApiMock();
    const { component } = await setup(rbac);

    expect(component).toBeTruthy();
    expect(component['roles']()).toEqual([ROLE_A]);
    expect(component['catalog']()).toEqual(CATALOG);
    expect(component['rolesLoading']()).toBe(false);
    expect(component['catalogLoading']()).toBe(false);
  });

  it('groups the catalog by menuKey for rendering, filtering out actions with no permissionId', async () => {
    const rbac = buildRbacApiMock();
    const { component } = await setup(rbac);

    const groups = component['catalogGroups']();
    expect(groups).toHaveLength(1);
    expect(groups[0].menuKey).toBe('drivers');
    // Only 'view' and 'edit' are renderable — 'delete' has permissionId: null.
    expect(groups[0].entries.map((e) => e.action)).toEqual(['view', 'edit']);
  });

  it('shows a load error and stops the spinner when the roles request fails', async () => {
    const rbac = buildRbacApiMock({ listRoles: () => throwError(() => new Error('network down')) });
    const { component } = await setup(rbac);

    expect(component['rolesLoading']()).toBe(false);
    expect(component['rolesError']()).toBe('Could not load roles.');
    expect(component['roles']()).toEqual([]);
  });

  it("pre-checks the matrix from the role's currently-granted permission ids on selection", async () => {
    const rbac = buildRbacApiMock({ rolePermissionIds: () => of(['perm-view-id']) });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);

    expect(component['permissionsLoading']()).toBe(false);
    expect(component['isPermissionChecked']('drivers:view')).toBe(true);
    expect(component['isPermissionChecked']('drivers:edit')).toBe(false);
  });

  it('toggling a checkbox and saving calls setRolePermissions with the selected permissionIds', async () => {
    const rbac = buildRbacApiMock();
    const setRolePermissions = vi.fn().mockReturnValue(of({}));
    (rbac as unknown as { setRolePermissions: typeof setRolePermissions }).setRolePermissions = setRolePermissions;
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);
    component['togglePermission']('drivers:view', true);
    expect(component['isPermissionChecked']('drivers:view')).toBe(true);
    expect(component['isPermissionChecked']('drivers:edit')).toBe(false);

    component['savePermissions']();

    expect(setRolePermissions).toHaveBeenCalledWith(ROLE_A.id, ['perm-view-id']);
    expect(component['savePermissionsSuccess']()).toBe(true);
  });

  it('unchecking a previously-checked permission removes it before saving', async () => {
    const rbac = buildRbacApiMock();
    const setRolePermissions = vi.fn().mockReturnValue(of({}));
    (rbac as unknown as { setRolePermissions: typeof setRolePermissions }).setRolePermissions = setRolePermissions;
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);
    component['togglePermission']('drivers:view', true);
    component['togglePermission']('drivers:edit', true);
    component['togglePermission']('drivers:view', false);
    component['savePermissions']();

    expect(setRolePermissions).toHaveBeenCalledWith(ROLE_A.id, ['perm-edit-id']);
  });

  it('surfaces an error when loading a role\'s current permissions fails', async () => {
    const rbac = buildRbacApiMock({
      rolePermissionIds: () => throwError(() => new Error('network down')),
    });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);

    expect(component['permissionsLoading']()).toBe(false);
    expect(component['savePermissionsError']()).toBe("Could not load this role's current permissions.");
  });

  it('surfaces an API error message when saving permissions fails', async () => {
    const rbac = buildRbacApiMock({
      setRolePermissions: () => throwError(() => new Error('Failed to save permissions.')),
    });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);
    component['togglePermission']('drivers:view', true);
    component['savePermissions']();

    expect(component['savingPermissions']()).toBe(false);
    expect(component['savePermissionsError']()).toBe('Failed to save permissions.');
    expect(component['savePermissionsSuccess']()).toBe(false);
  });

  it('selecting a different role re-fetches and replaces the permission matrix selection', async () => {
    const rolePermissionIds = vi.fn().mockReturnValueOnce(of(['perm-view-id'])).mockReturnValueOnce(of([]));
    const rbac = buildRbacApiMock({ rolePermissionIds });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);
    expect(component['isPermissionChecked']('drivers:view')).toBe(true);

    component['selectRole'](ROLE_A);
    expect(component['isPermissionChecked']('drivers:view')).toBe(false);
    expect(rolePermissionIds).toHaveBeenCalledTimes(2);
  });
});
