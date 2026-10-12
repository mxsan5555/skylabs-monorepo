import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
import type { Role } from '@skylabs-monorepo/shared-types';
import { provideSharedAuth } from '@skylabs-monorepo/shared-auth/angular';
import { AdministrationRoles } from './roles';
import { RbacApiService, type PermissionCatalogNode } from '../../../../core/rbac/rbac-api.service';

const ROLE_A: Role = {
  id: 'role-a',
  key: 'vendor',
  name: 'Vendor',
  isSystem: true,
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
    groupTitle: 'Drivers',
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
    refreshAuthorization: async () => undefined,
    permissionsCatalog: () => of(CATALOG),
    rolePermissionIds: () => of([]),
    listDashboardWidgets: () => of([]),
    roleWidgets: () => of([]),
    setRolePermissions: () => of({}),
    setRoleWidgets: () => of([]),
    ...overrides,
  } as unknown as RbacApiService;
}

async function setup(rbacMock: RbacApiService, canEdit = true) {
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
  vi.spyOn(component['auth'], 'can').mockReturnValue(canEdit);
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

  it('puts a section with a granted permission in grantedSections, not additionalModules', async () => {
    const rbac = buildRbacApiMock({ rolePermissionIds: () => of(['perm-view-id']) });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);

    expect(component['grantedSections']().map((s) => s.title)).toContain('Drivers');
    expect(component['additionalModules']()).toEqual([]);
  });

  it('puts a section with no granted permissions under additionalModules', async () => {
    const rbac = buildRbacApiMock({ rolePermissionIds: () => of([]) });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);

    expect(component['grantedSections']()).toEqual([]);
    expect(component['additionalModules']().map((g) => g.menuKey)).toContain('drivers');
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

    component['saveChanges']();

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
    component['saveChanges']();

    expect(setRolePermissions).toHaveBeenCalledWith(ROLE_A.id, ['perm-edit-id']);
  });

  it("surfaces an error when loading a role's current permissions fails", async () => {
    const rbac = buildRbacApiMock({ rolePermissionIds: () => throwError(() => new Error('network down')) });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);

    expect(component['permissionsLoading']()).toBe(false);
    expect(component['savePermissionsError']()).toBe("Could not load this role's current permissions.");
  });

  it('surfaces an API error message when saving permissions fails', async () => {
    const rbac = buildRbacApiMock({ setRolePermissions: () => throwError(() => new Error('Failed to save permissions.')) });
    const { component } = await setup(rbac);

    component['selectRole'](ROLE_A);
    component['togglePermission']('drivers:view', true);
    component['saveChanges']();

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

  it('ignores late permission responses from a previously selected role', async () => {
    const first = new Subject<string[]>();
    const second = new Subject<string[]>();
    const api = buildRbacApiMock({ rolePermissionIds: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) });
    const { component } = await setup(api);
    component['selectRole'](ROLE_A);
    component['selectRole']({ ...ROLE_A, id: 'role-b' });
    second.next(['perm-edit-id']);
    first.next(['perm-view-id']);
    expect(component['isPermissionChecked']('drivers:edit')).toBe(true);
    expect(component['isPermissionChecked']('drivers:view')).toBe(false);
  });

  it('Cancel restores the last-saved permissions by re-selecting the role', async () => {
    const rolePermissionIds = vi.fn().mockReturnValueOnce(of(['perm-view-id'])).mockReturnValueOnce(of(['perm-view-id']));
    const { component } = await setup(buildRbacApiMock({ rolePermissionIds }));
    component['selectRole'](ROLE_A);
    component['togglePermission']('drivers:edit', true);
    expect(component['isPermissionChecked']('drivers:edit')).toBe(true);

    component['cancelChanges']();

    expect(component['isPermissionChecked']('drivers:edit')).toBe(false);
    expect(component['isPermissionChecked']('drivers:view')).toBe(true);
  });

  it('a caller without rbac.roles:edit cannot edit permissions', async () => {
    const { component } = await setup(buildRbacApiMock(), false);
    component['selectRole'](ROLE_A);
    expect(component['canEditPermissions']()).toBe(false);
  });

  it("Super Admin's permissions are never editable, even by a Super Admin caller", async () => {
    const SUPER_ADMIN_ROLE: Role = { ...ROLE_A, id: 'role-super', key: 'super_admin', name: 'Super Admin', isSuperAdmin: true };
    const { component } = await setup(buildRbacApiMock({ listRoles: () => of([SUPER_ADMIN_ROLE]) }), true);
    component['selectRole'](SUPER_ADMIN_ROLE);
    expect(component['canEditPermissions']()).toBe(false);
  });
  it('selects Super Admin on entry and reconciles saved IDs after a late catalog response', async () => {
    const catalog = new Subject<PermissionCatalogNode[]>();
    const superRole = {...ROLE_A,id:'super',key:'super_admin',name:'Super Admin',isSuperAdmin:true};
    const {component,fixture} = await setup(buildRbacApiMock({listRoles:()=>of([ROLE_A,superRole]),permissionsCatalog:()=>catalog,rolePermissionIds:()=>of(['perm-view-id'])}));
    expect(component['selectedRoleId']()).toBe('super');
    catalog.next(CATALOG);fixture.detectChanges();
    expect(component['isPermissionChecked']('drivers:view')).toBe(true);
    expect(component['isPermissionChecked']('drivers:edit')).toBe(false);
    expect(fixture.nativeElement.querySelector('button[aria-pressed="true"]').textContent).toContain('Super Admin');
  });

  it('creates an unprivileged custom role, selects it and loads its actual saved matrix', async () => {
    const newRole={...ROLE_A,id:'custom',key:'operations',name:'Operations',isSystem:false};
    const createRole=vi.fn(()=>of(newRole));
    const {component}=await setup(buildRbacApiMock({createRole,rolePermissionIds:()=>of([])}));
    component['openRoleForm']();component['roleName']='Operations';component['roleKey']='operations';component['roleDescription']='Scoped work';component['saveRole']();
    expect(createRole).toHaveBeenCalledWith({name:'Operations',key:'operations',description:'Scoped work'});
    expect(component['selectedRoleId']()).toBe('custom');
    expect(component['selectedPermissionKeys']().size).toBe(0);
    expect(component['roleFormOpen']()).toBe(false);
  });

  it('edits details without submitting permissions or replacing a pending permission draft', async () => {
    const updateRole=vi.fn(()=>of({...ROLE_A,name:'Renamed Vendor'}));
    const {component}=await setup(buildRbacApiMock({updateRole,rolePermissionIds:()=>of(['perm-view-id'])}));
    component['selectRole'](ROLE_A);component['togglePermission']('drivers:edit',true);
    component['openRoleForm'](true);expect(component['roleName']).toBe('Vendor');
    component['roleName']='Renamed Vendor';component['saveRole']();
    expect(updateRole).toHaveBeenCalledWith(ROLE_A.id,{name:'Renamed Vendor',description:''});
    expect(component['selectedRole']()?.key).toBe('vendor');
    expect(component['isPermissionChecked']('drivers:edit')).toBe(true);
    expect(component['hasUnsavedChanges']()).toBe(true);
  });

  it('rejects duplicate names locally and keeps a failed details save open', async () => {
    const createRole=vi.fn(()=>throwError(()=>new Error('Database unavailable')));
    const {component}=await setup(buildRbacApiMock({createRole}));
    component['openRoleForm']();component['roleName']='vendor';component['roleKey']='different';component['saveRole']();
    expect(createRole).not.toHaveBeenCalled();expect(component['roleFormError']()).toContain('already exists');
    component['roleName']='New Role';component['saveRole']();
    expect(component['roleFormOpen']()).toBe(true);expect(component['roleFormError']()).toBe('Database unavailable');
    expect(component['roles']()).toEqual([ROLE_A]);
  });

  it('preserves saved actions absent from the current catalog when editing a visible action', async () => {
    const save=vi.fn(()=>of({}));
    const {component}=await setup(buildRbacApiMock({rolePermissionIds:()=>of(['hidden-assign','perm-view-id']),setRolePermissions:save}));
    component['selectRole'](ROLE_A);component['togglePermission']('drivers:view',false);component['saveChanges']();
    expect(save).toHaveBeenCalledWith(ROLE_A.id,['hidden-assign']);
    expect(component['hasUnsavedChanges']()).toBe(false);
  });

  it('retains the selected role and draft when unsaved-change confirmation is declined', async () => {
    const confirmation=vi.spyOn(window,'confirm').mockReturnValue(false);
    const {component}=await setup(buildRbacApiMock());
    component['selectRole'](ROLE_A);component['togglePermission']('drivers:edit',true);
    component['selectRole']({...ROLE_A,id:'another'});
    expect(component['selectedRoleId']()).toBe(ROLE_A.id);expect(component['isPermissionChecked']('drivers:edit')).toBe(true);
    confirmation.mockRestore();
  });

});
