import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import type { DashboardWidget, Role } from '@skylabs-monorepo/shared-types';
import { AuthService, HasPermissionDirective } from '@skylabs-monorepo/shared-auth/angular';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { RbacApiService, type PermissionCatalogAction, type PermissionCatalogNode } from '../../../../core/rbac/rbac-api.service';

interface CatalogGroup {
  menuKey: string;
  title: string;
  groupTitle?: string;
  entries: PermissionCatalogAction[];
}

interface MatrixSection {
  title: string;
  groups: CatalogGroup[];
}

/** Staff role details and permissions are saved independently through the existing RBAC API. */
@Component({
  selector: 'md-administration-roles',
  imports: [AdminPage, HasPermissionDirective],
  templateUrl: './roles.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdministrationRoles {
  private readonly rbac = inject(RbacApiService);
  protected readonly auth = inject(AuthService);

  protected readonly matrixActions = ['view', 'create', 'edit', 'delete'] as const;
  protected readonly permissionLoadFailed = signal(false);
  private readonly savedPermissionIds = signal<string[]>([]);
  private requestSequence = 0;

  protected actionFor(group: CatalogGroup, action: string): PermissionCatalogAction | undefined {
    return group.entries.find((e) => e.action === action);
  }

  /** Read-only summary of what a role's record scope is — permission grants alone don't
   *  convey ownership/assignment restrictions, so this is shown alongside the matrix. */
  protected scopeSummary(): string {
    const key = this.selectedRole()?.key;
    return (
      ({
        super_admin: 'All records; protected system access.',
        admin: 'All business records; cannot bypass Super Admin protection.',
        vendor: 'Own linked or created drivers and their assigned bookings.',
        marketing: 'Marketing data (promotions, promo usage, FAQs, aggregated reports).',
        sales: 'Own created or assigned leads and their bookings.',
        company: 'Own company records.',
        data_operator: 'Own created or assigned drivers.',
        support: 'Assigned support work.',
        kyc_verification: 'Assigned KYC cases only.',
      }) as Record<string, string>
    )[key ?? ''] ?? 'Own created business records; assignment restrictions also apply.';
  }

  protected canEditPermissions(): boolean {
    return this.auth.can('rbac.roles', 'edit') && !this.selectedRole()?.isSuperAdmin;
  }

  protected readonly roleFormOpen = signal(false);
  protected readonly editingRoleId = signal<string | null>(null);
  protected readonly savingRole = signal(false);
  protected readonly roleFormError = signal<string | null>(null);
  protected readonly roleFormSuccess = signal<string | null>(null);
  protected roleName = '';
  protected roleKey = '';
  protected roleDescription = '';

  protected openRoleForm(edit = false): void {
    if (this.savingPermissions() || this.savingRole()) return;
    const role = edit ? this.selectedRole() : undefined;
    if (!this.auth.can('rbac.roles', edit ? 'edit' : 'create') || (edit && !role)) return;
    this.editingRoleId.set(role?.id ?? null);
    this.roleName = role?.name ?? '';
    this.roleKey = role?.key ?? '';
    this.roleDescription = role?.description ?? '';
    this.roleFormError.set(null);
    this.roleFormSuccess.set(null);
    this.roleFormOpen.set(true);
  }

  protected saveRole(): void {
    const id = this.editingRoleId();
    if (this.savingRole() || !this.auth.can('rbac.roles', id ? 'edit' : 'create')) return;
    const name = this.roleName.trim(), key = this.roleKey.trim();
    if (!name || (!id && !/^[a-z][a-z0-9_]+$/.test(key))) {
      this.roleFormError.set('Name and a valid snake_case key of at least two characters are required.'); return;
    }
    if (this.roles().some(r => r.id !== id && (r.name.toLowerCase() === name.toLowerCase() || (!id && r.key === key)))) {
      this.roleFormError.set('A role with this name or key already exists.'); return;
    }
    if (!id && (this.hasUnsavedChanges() || this.hasUnsavedWidgetChanges()) && !confirm('Discard unsaved role settings?')) return;
    this.savingRole.set(true); this.roleFormError.set(null);
    const details = { name, description: this.roleDescription.trim() };
    const request = id ? this.rbac.updateRole(id, details) : this.rbac.createRole({ ...details, key });
    request.subscribe({
      next: role => {
        this.roles.update(list => id ? list.map(r => r.id === id ? role : r) : [...list, role]);
        this.savingRole.set(false); this.roleFormOpen.set(false);
        this.roleFormSuccess.set(id ? 'Role details saved.' : 'Role created. Configure its permissions below.');
        if (!id) this.selectRole(role, true);
        void this.rbac.refreshAuthorization();
      },
      error: err => {
        this.savingRole.set(false);
        this.roleFormError.set(err.error?.error?.message || err.message || 'Failed to save role.');
      },
    });
  }

  private applySavedPermissions(): void {
    const granted = new Set(this.savedPermissionIds());
    const keys = new Set<string>();
    for (const action of this.catalogActionsByKey().values()) {
      if (action.permissionId && granted.has(action.permissionId)) keys.add(action.key);
    }
    this.selectedPermissionKeys.set(keys);
    this.grantedSectionTitles.set(new Set(this.allSections().filter(s => s.groups.some(g => g.entries.some(e => keys.has(e.key)))).map(s => s.title)));
  }

  // Role list ------------------------------------------------------------
  protected readonly roles = signal<Role[]>([]);
  protected readonly rolesLoading = signal(true);
  protected readonly rolesError = signal<string | null>(null);
  protected readonly selectedRoleId = signal<string | null>(null);
  protected readonly selectedRole = computed(() => this.roles().find((r) => r.id === this.selectedRoleId()));

  // Permission catalog ------------------------------------------------------------
  protected readonly catalog = signal<PermissionCatalogNode[]>([]);
  protected readonly catalogLoading = signal(true);
  protected readonly catalogError = signal<string | null>(null);

  /** Flat lookup of every catalog action, keyed by its canonical `key` — used to resolve a
   *  selected checkbox back to its real `permissionId` on save. */
  private readonly catalogActionsByKey = computed(() => {
    const map = new Map<string, PermissionCatalogAction>();
    for (const node of this.catalog()) for (const action of node.actions) map.set(action.key, action);
    return map;
  });

  /** Only actions with a real `permissionId` are renderable — nothing to submit otherwise. */
  protected readonly catalogGroups = computed<CatalogGroup[]>(() =>
    this.catalog()
      .map((node) => ({
        menuKey: node.menuKey,
        title: node.title,
        groupTitle: node.groupTitle ?? node.title,
        entries: node.actions.filter((a) => a.permissionId !== null),
      }))
      .filter((group) => group.entries.length > 0),
  );

  private readonly allSections = computed<MatrixSection[]>(() => {
    const sections = new Map<string, CatalogGroup[]>();
    for (const group of this.catalogGroups()) {
      const title = group.groupTitle ?? group.title;
      sections.set(title, [...(sections.get(title) ?? []), group]);
    }
    return [...sections].map(([title, groups]) => ({ title, groups }));
  });

  /** Snapshot of which section titles had at least one granted permission, taken when the
   *  role's saved permissions finish loading — deliberately NOT recomputed from the live
   *  (still-being-edited) selection, so a section never jumps between "granted" and
   *  "Additional modules" mid-edit while the caller is checking/unchecking boxes. */
  private readonly grantedSectionTitles = signal<Set<string>>(new Set());

  /** Groups with assigned access render first (each its own open-by-default accordion
   *  item); everything else collapses into one "Additional modules" item. */
  protected readonly grantedSections = computed(() => this.allSections().filter((s) => this.grantedSectionTitles().has(s.title)));
  protected readonly additionalModules = computed(() => this.allSections().filter((s) => !this.grantedSectionTitles().has(s.title)).flatMap((s) => s.groups));

  protected readonly selectedPermissionKeys = signal<Set<string>>(new Set());
  protected readonly permissionsLoading = signal(false);
  protected readonly savingPermissions = signal(false);
  protected readonly savePermissionsError = signal<string | null>(null);
  protected readonly savePermissionsSuccess = signal(false);
  protected readonly hasUnsavedChanges = computed(() => {
    const catalogIds = new Set([...this.catalogActionsByKey().values()].map(a => a.permissionId));
    const saved = new Set(this.savedPermissionIds().filter(id => catalogIds.has(id)));
    const current = new Set([...this.selectedPermissionKeys()].map((key) => this.catalogActionsByKey().get(key)?.permissionId).filter((id): id is string => !!id));
    return saved.size !== current.size || [...current].some((id) => !saved.has(id));
  });

  // Dashboard widgets ------------------------------------------------------------
  protected readonly widgets = signal<DashboardWidget[]>([]);
  protected readonly widgetsLoading = signal(true);
  protected readonly widgetsError = signal<string | null>(null);
  protected readonly selectedWidgetOrders = signal<Map<string, number>>(new Map());
  private readonly savedWidgetOrders = signal<Map<string, number>>(new Map());
  protected readonly hasUnsavedWidgetChanges = computed(() => {
    const current = this.selectedWidgetOrders(), saved = this.savedWidgetOrders();
    return current.size !== saved.size || [...current].some(([id, order]) => saved.get(id) !== order);
  });
  protected readonly savingWidgets = signal(false);
  protected readonly roleWidgetsLoading = signal(false);
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
        this.roles.set(roles.filter(r => !['driver', 'customer'].includes(r.key)));
        const initial = this.roles().find(r => r.isSuperAdmin);
        if (initial && !this.selectedRoleId()) this.selectRole(initial);
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
        this.applySavedPermissions();
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

  protected selectRole(role: Role, discard = false): void {
    if (!discard && this.selectedRoleId() !== role.id && (this.hasUnsavedChanges() || this.hasUnsavedWidgetChanges()) && !confirm('Discard unsaved role settings?')) return;
    if (this.savingWidgets() || this.savingPermissions() || this.savingRole()) return;
    const sequence = ++this.requestSequence;
    this.permissionLoadFailed.set(false);
    this.savedPermissionIds.set([]);
    this.selectedRoleId.set(role.id);
    this.selectedPermissionKeys.set(new Set());
    this.grantedSectionTitles.set(new Set());
    this.selectedWidgetOrders.set(new Map());
    this.savedWidgetOrders.set(new Map());
    this.savePermissionsError.set(null);
    this.savePermissionsSuccess.set(false);
    this.saveWidgetsError.set(null);
    this.saveWidgetsSuccess.set(false);

    this.permissionsLoading.set(true);
    this.rbac.rolePermissionIds(role.id).subscribe({
      next: (permissionIds) => {
        if (sequence !== this.requestSequence) return;
        this.savedPermissionIds.set(permissionIds);
        this.applySavedPermissions();
        this.permissionsLoading.set(false);
      },
      error: () => {
        if (sequence !== this.requestSequence) return;
        this.permissionsLoading.set(false);
        this.permissionLoadFailed.set(true);
        this.savePermissionsError.set("Could not load this role's current permissions.");
      },
    });
    this.roleWidgetsLoading.set(true);
    this.rbac.roleWidgets(role.id).subscribe({
      next: (links) => {
        if (sequence !== this.requestSequence) return;
        const orders = new Map(links.map((link) => [link.widgetId, link.order]));
        this.savedWidgetOrders.set(orders);
        this.selectedWidgetOrders.set(new Map(orders));
        this.roleWidgetsLoading.set(false);
      },
      error: () => {
        if (sequence === this.requestSequence) {
          this.roleWidgetsLoading.set(false);
          this.saveWidgetsError.set('Could not load saved dashboard widgets.');
        }
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

  /** Cancel — discard the in-progress draft and restore the role's last-saved permissions. */
  protected cancelChanges(): void {
    const role = this.selectedRole();
    if (role) this.selectRole(role, true);
  }

  /** Save Changes — one atomic `PUT /rbac/roles/:id/permissions` call. */
  protected saveChanges(): void {
    const role = this.selectedRole();
    if (this.savingPermissions() || this.savingRole() || !role || !this.canEditPermissions() || this.permissionsLoading() || this.catalogLoading() || this.permissionLoadFailed() || this.catalogError()) return;

    const byKey = this.catalogActionsByKey();
    const catalogIds = new Set([...byKey.values()].map(a => a.permissionId));
    const ids = [...this.savedPermissionIds().filter(id => !catalogIds.has(id)), ...[...this.selectedPermissionKeys()].map(key => byKey.get(key)?.permissionId).filter((id): id is string => !!id)];

    const sequence = this.requestSequence;
    this.savingPermissions.set(true);
    this.savePermissionsError.set(null);
    this.savePermissionsSuccess.set(false);
    this.rbac.setRolePermissions(role.id, ids).subscribe({
      next: () => {
        this.savingPermissions.set(false);
        if (sequence !== this.requestSequence) return;
        this.savedPermissionIds.set(ids);
        this.savePermissionsSuccess.set(true);
        void this.rbac.refreshAuthorization();
      },
      error: (err: { error?: { error?: { message?: string } }; message?: string }) => {
        this.savingPermissions.set(false);
        if (sequence === this.requestSequence) this.savePermissionsError.set(err.error?.error?.message || err.message || 'Failed to save permissions.');
      },
    });
  }

  protected saveWidgets(): void {
    if (!this.auth.can('rbac.roles','edit') || this.savingRole() || this.savingWidgets() || this.roleWidgetsLoading() || this.saveWidgetsError()) return;
    const role = this.selectedRole();
    if (!role) return;

    const widgets = [...this.selectedWidgetOrders()].map(([widgetId, order]) => ({ widgetId, order }));
    this.savingWidgets.set(true);
    this.saveWidgetsError.set(null);
    this.saveWidgetsSuccess.set(false);
    this.rbac.setRoleWidgets(role.id, widgets).subscribe({
      next: () => {
        this.savingWidgets.set(false);
        this.savedWidgetOrders.set(new Map(this.selectedWidgetOrders()));
        this.saveWidgetsSuccess.set(true);
        void this.rbac.refreshAuthorization();
      },
      error: (err: Error) => {
        this.savingWidgets.set(false);
        this.saveWidgetsError.set(err.message || 'Failed to save widget assignment.');
      },
    });
  }
}
