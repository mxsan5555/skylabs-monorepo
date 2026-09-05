import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import type { DashboardWidget, Role } from '@skylabs-monorepo/shared-types';
import { HasPermissionDirective } from '@skylabs-monorepo/shared-auth/angular';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { RbacApiService, type PermissionCatalogAction, type PermissionCatalogNode } from '../../../../core/rbac/rbac-api.service';

interface CatalogGroup {
  menuKey: string;
  title: string;
  entries: PermissionCatalogAction[];
}

/**
 * Role Management (`/account/administration/roles`): role list -> select ->
 * permission matrix + dashboard-widget assignment.
 *
 * `GET /rbac/permissions/catalog` returns a `PermissionCatalogNode[]` — one
 * node per menu item, each carrying every grantable action and, per action, a
 * real `Permission.id` (or `null` if no Permission row exists yet for that
 * pair — see `RbacApiService`'s doc). The matrix only renders actions with a
 * non-null id, since there's nothing to submit for the rest. Selecting a role
 * pre-checks the matrix from `GET /rbac/roles/:id/permissions` (the role's
 * current grants) rather than starting empty. Widget assignment has no such
 * gap (`DashboardWidget.id` is always real) and saves normally.
 */
@Component({
  selector: 'md-administration-roles',
  imports: [AdminPage, HasPermissionDirective],
  templateUrl: './roles.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdministrationRoles {
  private readonly rbac = inject(RbacApiService);

  // Role list ------------------------------------------------------------
  protected readonly roles = signal<Role[]>([]);
  protected readonly rolesLoading = signal(true);
  protected readonly rolesError = signal<string | null>(null);
  protected readonly selectedRoleId = signal<string | null>(null);
  protected readonly selectedRole = computed(() =>
    this.roles().find((r) => r.id === this.selectedRoleId()),
  );

  // Create role ------------------------------------------------------------
  protected newRoleKey = '';
  protected newRoleName = '';
  protected newRoleDescription = '';
  protected readonly creatingRole = signal(false);
  protected readonly createRoleError = signal<string | null>(null);

  // Clone role ------------------------------------------------------------
  protected readonly cloningRoleId = signal<string | null>(null);
  protected cloneKey = '';
  protected cloneName = '';
  protected readonly cloneError = signal<string | null>(null);
  protected readonly cloneBusy = signal(false);

  protected readonly roleActionError = signal<string | null>(null);

  // Permission catalog ------------------------------------------------------------
  protected readonly catalog = signal<PermissionCatalogNode[]>([]);
  protected readonly catalogLoading = signal(true);
  protected readonly catalogError = signal<string | null>(null);

  /** Flat lookup of every catalog action, keyed by its canonical `key` — used to
   *  resolve a selected checkbox back to its real `permissionId` on save. */
  private readonly catalogActionsByKey = computed(() => {
    const map = new Map<string, PermissionCatalogAction>();
    for (const node of this.catalog()) {
      for (const action of node.actions) map.set(action.key, action);
    }
    return map;
  });

  /** Only actions with a real `permissionId` are renderable — nothing to submit otherwise. */
  protected readonly catalogGroups = computed<CatalogGroup[]>(() =>
    this.catalog()
      .map((node) => ({
        menuKey: node.menuKey,
        title: node.title,
        entries: node.actions.filter((a) => a.permissionId !== null),
      }))
      .filter((group) => group.entries.length > 0),
  );

  protected readonly selectedPermissionKeys = signal<Set<string>>(new Set());
  protected readonly permissionsLoading = signal(false);
  protected readonly savingPermissions = signal(false);
  protected readonly savePermissionsError = signal<string | null>(null);
  protected readonly savePermissionsSuccess = signal(false);

  // Dashboard widgets ------------------------------------------------------------
  protected readonly widgets = signal<DashboardWidget[]>([]);
  protected readonly widgetsLoading = signal(true);
  protected readonly widgetsError = signal<string | null>(null);
  protected readonly selectedWidgetOrders = signal<Map<string, number>>(new Map());
  protected readonly savingWidgets = signal(false);
  protected readonly saveWidgetsError = signal<string | null>(null);
  protected readonly saveWidgetsSuccess = signal(false);

  constructor() {
    this.loadRoles();
    this.loadCatalog();
    this.loadWidgets();
  }

  private loadRoles(): void {
    this.rolesLoading.set(true);
    this.rolesError.set(null);
    this.rbac.listRoles().subscribe({
      next: (roles) => {
        this.roles.set(roles);
        this.rolesLoading.set(false);
      },
      error: () => {
        this.rolesLoading.set(false);
        this.rolesError.set('Could not load roles.');
      },
    });
  }

  private loadCatalog(): void {
    this.catalogLoading.set(true);
    this.catalogError.set(null);
    this.rbac.permissionsCatalog().subscribe({
      next: (catalog) => {
        this.catalog.set(catalog);
        this.catalogLoading.set(false);
      },
      error: () => {
        this.catalogLoading.set(false);
        this.catalogError.set('Could not load the permission catalog.');
      },
    });
  }

  private loadWidgets(): void {
    this.widgetsLoading.set(true);
    this.widgetsError.set(null);
    this.rbac.listDashboardWidgets().subscribe({
      next: (widgets) => {
        this.widgets.set(widgets);
        this.widgetsLoading.set(false);
      },
      error: () => {
        this.widgetsLoading.set(false);
        this.widgetsError.set('Could not load dashboard widgets.');
      },
    });
  }

  protected selectRole(role: Role): void {
    this.selectedRoleId.set(role.id);
    // No endpoint returns a role's currently-assigned dashboard widgets yet, so that
    // half still starts empty — but permissions are pre-checked from the server below.
    this.selectedPermissionKeys.set(new Set());
    this.selectedWidgetOrders.set(new Map());
    this.savePermissionsError.set(null);
    this.savePermissionsSuccess.set(false);
    this.saveWidgetsError.set(null);
    this.saveWidgetsSuccess.set(false);

    this.permissionsLoading.set(true);
    this.rbac.rolePermissionIds(role.id).subscribe({
      next: (permissionIds) => {
        const granted = new Set(permissionIds);
        const keys = new Set<string>();
        for (const action of this.catalogActionsByKey().values()) {
          if (action.permissionId && granted.has(action.permissionId)) keys.add(action.key);
        }
        this.selectedPermissionKeys.set(keys);
        this.permissionsLoading.set(false);
      },
      error: () => {
        this.permissionsLoading.set(false);
        this.savePermissionsError.set("Could not load this role's current permissions.");
      },
    });
  }

  protected togglePermission(key: string, checked: boolean): void {
    const next = new Set(this.selectedPermissionKeys());
    if (checked) next.add(key);
    else next.delete(key);
    this.selectedPermissionKeys.set(next);
  }

  protected isPermissionChecked(key: string): boolean {
    return this.selectedPermissionKeys().has(key);
  }

  protected toggleWidget(widgetId: string, checked: boolean): void {
    const next = new Map(this.selectedWidgetOrders());
    if (checked) next.set(widgetId, next.size + 1);
    else next.delete(widgetId);
    this.selectedWidgetOrders.set(next);
  }

  protected isWidgetChecked(widgetId: string): boolean {
    return this.selectedWidgetOrders().has(widgetId);
  }

  protected setWidgetOrder(widgetId: string, order: number): void {
    const current = this.selectedWidgetOrders();
    if (!current.has(widgetId)) return;
    this.selectedWidgetOrders.set(new Map(current).set(widgetId, order));
  }

  protected savePermissions(): void {
    const role = this.selectedRole();
    if (!role) return;

    const byKey = this.catalogActionsByKey();
    const ids = [...this.selectedPermissionKeys()]
      .map((key) => byKey.get(key)?.permissionId)
      .filter((id): id is string => !!id);

    this.savingPermissions.set(true);
    this.savePermissionsError.set(null);
    this.savePermissionsSuccess.set(false);
    this.rbac.setRolePermissions(role.id, ids).subscribe({
      next: () => {
        this.savingPermissions.set(false);
        this.savePermissionsSuccess.set(true);
      },
      error: (err: Error) => {
        this.savingPermissions.set(false);
        this.savePermissionsError.set(err.message || 'Failed to save permissions.');
      },
    });
  }

  protected saveWidgets(): void {
    const role = this.selectedRole();
    if (!role) return;

    const widgets = [...this.selectedWidgetOrders()].map(([widgetId, order]) => ({ widgetId, order }));
    this.savingWidgets.set(true);
    this.saveWidgetsError.set(null);
    this.saveWidgetsSuccess.set(false);
    this.rbac.setRoleWidgets(role.id, widgets).subscribe({
      next: () => {
        this.savingWidgets.set(false);
        this.saveWidgetsSuccess.set(true);
      },
      error: (err: Error) => {
        this.savingWidgets.set(false);
        this.saveWidgetsError.set(err.message || 'Failed to save widget assignment.');
      },
    });
  }

  protected createRole(): void {
    const key = this.newRoleKey.trim();
    const name = this.newRoleName.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      this.createRoleError.set('Key must be snake_case, starting with a letter (e.g. fleet_manager).');
      return;
    }
    if (!name) {
      this.createRoleError.set('Name is required.');
      return;
    }

    this.creatingRole.set(true);
    this.createRoleError.set(null);
    this.rbac.createRole({ key, name, description: this.newRoleDescription.trim() || undefined }).subscribe({
      next: (role) => {
        this.creatingRole.set(false);
        this.roles.update((rs) => [...rs, role]);
        this.newRoleKey = '';
        this.newRoleName = '';
        this.newRoleDescription = '';
      },
      error: (err: Error) => {
        this.creatingRole.set(false);
        this.createRoleError.set(err.message || 'Failed to create role.');
      },
    });
  }

  protected startClone(role: Role): void {
    this.cloningRoleId.set(role.id);
    this.cloneKey = `${role.key}_copy`;
    this.cloneName = `${role.name} (copy)`;
    this.cloneError.set(null);
  }

  protected cancelClone(): void {
    this.cloningRoleId.set(null);
  }

  protected confirmClone(): void {
    const sourceId = this.cloningRoleId();
    if (!sourceId) return;
    const key = this.cloneKey.trim();
    const name = this.cloneName.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key) || !name) {
      this.cloneError.set('Provide a valid snake_case key and a name.');
      return;
    }

    this.cloneBusy.set(true);
    this.rbac.cloneRole(sourceId, { key, name }).subscribe({
      next: (role) => {
        this.cloneBusy.set(false);
        this.roles.update((rs) => [...rs, role]);
        this.cloningRoleId.set(null);
      },
      error: (err: Error) => {
        this.cloneBusy.set(false);
        this.cloneError.set(err.message || 'Failed to clone role.');
      },
    });
  }

  protected toggleStatus(role: Role): void {
    this.roleActionError.set(null);
    this.rbac.setRoleStatus(role.id, !role.isActive).subscribe({
      next: (updated) => {
        this.roles.update((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      },
      error: (err: Error) => this.roleActionError.set(err.message || 'Failed to update role status.'),
    });
  }

  protected deleteRole(role: Role): void {
    this.roleActionError.set(null);
    this.rbac.deleteRole(role.id).subscribe({
      next: () => {
        this.roles.update((rs) => rs.filter((r) => r.id !== role.id));
        if (this.selectedRoleId() === role.id) this.selectedRoleId.set(null);
      },
      error: (err: Error) => this.roleActionError.set(err.message || 'Failed to delete role.'),
    });
  }
}
