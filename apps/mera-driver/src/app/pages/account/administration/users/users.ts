import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, HasPermissionDirective } from '@skylabs-monorepo/shared-auth/angular';
import type { DeviceSession, LoginHistoryEntry, Role, User, UserStatus } from '@skylabs-monorepo/shared-types';
import type { SkyDataTableAction, SkyDataTableColumn, SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { RbacApiService, type PermissionCatalogAction, type PermissionCatalogNode } from '../../../../core/rbac/rbac-api.service';

type OverrideState = 'inherit' | 'grant' | 'revoke';

interface OverrideCatalogGroup {
  menuKey: string;
  title: string;
  entries: PermissionCatalogAction[];
}

type RbacUser = User & { roles: { role: Role }[] };

interface UserRow {
  id: string;
  name: string;
  contact: string;
  roles: string;
  status: UserStatus;
}

const COLUMNS: SkyDataTableColumn[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'contact', label: 'Email / Phone' },
  { key: 'roles', label: 'Roles' },
  {
    key: 'status',
    label: 'Status',
    type: 'status',
    statusMap: { active: 'success', inactive: 'warning', blocked: 'error' },
  },
];

const ACTIONS: SkyDataTableAction[] = [
  { icon: 'manage_accounts', label: 'Manage', event: 'manage' },
];

/**
 * User Management (`/account/administration/users`). Uses `sky-data-table` for
 * list/search/sort/pagination; selecting a row's "Manage" action opens a
 * master-detail panel below with role assignment, status control, session/OTP
 * reset, login history, device sessions, and (for callers who hold
 * `rbac.users:assign`) "Login As".
 *
 * ASSUMPTION: `GET /rbac/users` only accepts `page`/`pageSize` (see
 * `rbac.routes.ts`) — no server-side `search` query param exists yet. This
 * screen fetches a generous page size once and does search/sort/pagination
 * client-side over that set, which is fine for the small admin user lists
 * expected here but would need a real `search` param server-side to scale.
 */
@Component({
  selector: 'md-administration-users',
  imports: [AdminPage, HasPermissionDirective],
  templateUrl: './users.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdministrationUsers {
  private readonly rbac = inject(RbacApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly allUsers = signal<RbacUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly roles = signal<Role[]>([]);

  protected readonly search = signal('');
  protected readonly sortKey = signal('');
  protected readonly sortDir = signal<'asc' | 'desc' | ''>('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);

  protected readonly columns = COLUMNS;
  protected readonly actions = ACTIONS;

  private readonly filteredSorted = computed(() => {
    const term = this.search().trim().toLowerCase();
    let list = this.allUsers();
    if (term) {
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          (u.email ?? '').toLowerCase().includes(term) ||
          (u.phone ?? '').toLowerCase().includes(term),
      );
    }
    const key = this.sortKey();
    const dir = this.sortDir();
    if (key && dir) {
      const sorted = [...list].sort((a, b) => {
        const av = String((a as unknown as Record<string, unknown>)[key] ?? '');
        const bv = String((b as unknown as Record<string, unknown>)[key] ?? '');
        return av.localeCompare(bv);
      });
      list = dir === 'asc' ? sorted : sorted.reverse();
    }
    return list;
  });

  protected readonly total = computed(() => this.filteredSorted().length);

  protected readonly rows = computed<UserRow[]>(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filteredSorted()
      .slice(start, start + this.pageSize())
      .map((u) => ({
        id: u.id,
        name: u.name,
        contact: u.email ?? u.phone ?? '—',
        roles: u.roles.map((r) => r.role.name).join(', ') || '—',
        status: u.status,
      }));
  });

  protected readonly rowsJson = computed(() => JSON.stringify(this.rows()));
  protected readonly columnsJson = JSON.stringify(this.columns);
  protected readonly actionsJson = JSON.stringify(this.actions);

  // Detail panel ----------------------------------------------------------
  protected readonly selectedUserId = signal<string | null>(null);
  protected readonly selectedUser = computed(() =>
    this.allUsers().find((u) => u.id === this.selectedUserId()),
  );
  protected readonly canLoginAs = computed(() => this.auth.can('rbac.users', 'assign'));

  protected addRoleId = '';
  protected readonly detailBusy = signal(false);
  protected readonly detailError = signal<string | null>(null);
  protected readonly detailMessage = signal<string | null>(null);

  protected readonly loginHistory = signal<LoginHistoryEntry[] | null>(null);
  protected readonly sessions = signal<DeviceSession[] | null>(null);

  // Permission overrides -------------------------------------------------
  protected readonly catalog = signal<PermissionCatalogNode[]>([]);
  private readonly catalogActionsByKey = computed(() => {
    const map = new Map<string, PermissionCatalogAction>();
    for (const node of this.catalog()) {
      for (const action of node.actions) map.set(action.key, action);
    }
    return map;
  });
  protected readonly overrideCatalogGroups = computed<OverrideCatalogGroup[]>(() =>
    this.catalog()
      .map((node) => ({ menuKey: node.menuKey, title: node.title, entries: node.actions.filter((a) => a.permissionId !== null) }))
      .filter((group) => group.entries.length > 0),
  );
  protected readonly overrideStates = signal<Map<string, OverrideState>>(new Map());
  protected readonly overridesLoading = signal(false);
  protected readonly savingOverrides = signal(false);
  protected readonly overridesError = signal<string | null>(null);
  protected readonly overridesSuccess = signal(false);
  protected readonly effectivePermissions = signal<string[] | null>(null);

  // Create user ----------------------------------------------------------
  protected newUserName = '';
  protected newUserEmail = '';
  protected newUserPhone = '';
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  constructor() {
    this.loadUsers();
    this.rbac.listRoles().subscribe({ next: (roles) => this.roles.set(roles) });
    this.rbac.permissionsCatalog().subscribe({ next: (catalog) => this.catalog.set(catalog) });
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.rbac.listUsers(1, 100).subscribe({
      next: (page) => {
        this.allUsers.set(page.items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load users.');
      },
    });
  }

  protected onParamsChange(event: Event): void {
    const detail = (event as CustomEvent<SkyDataTableParamsDetail>).detail;
    this.search.set(detail.search);
    this.sortKey.set(detail.sortKey);
    this.sortDir.set(detail.sortDir);
    this.page.set(detail.page);
    this.pageSize.set(detail.pageSize);
  }

  protected onRowAction(event: Event): void {
    const detail = (event as CustomEvent<{ action: string; row: UserRow }>).detail;
    if (detail.action === 'manage') this.selectUser(detail.row.id);
  }

  protected selectUser(id: string): void {
    this.selectedUserId.set(id);
    this.addRoleId = '';
    this.detailError.set(null);
    this.detailMessage.set(null);
    this.loginHistory.set(null);
    this.sessions.set(null);
    this.overrideStates.set(new Map());
    this.overridesError.set(null);
    this.overridesSuccess.set(false);
    this.effectivePermissions.set(null);
    this.loadOverrides(id);
  }

  protected closeDetail(): void {
    this.selectedUserId.set(null);
  }

  private loadOverrides(userId: string): void {
    this.overridesLoading.set(true);
    this.rbac.userPermissionOverrides(userId).subscribe({
      next: ({ grants, revokes }) => {
        const byKey = this.catalogActionsByKey();
        const idToKey = new Map<string, string>();
        for (const action of byKey.values()) {
          if (action.permissionId) idToKey.set(action.permissionId, action.key);
        }
        const states = new Map<string, OverrideState>();
        for (const id of grants) {
          const key = idToKey.get(id);
          if (key) states.set(key, 'grant');
        }
        for (const id of revokes) {
          const key = idToKey.get(id);
          if (key) states.set(key, 'revoke');
        }
        this.overrideStates.set(states);
        this.overridesLoading.set(false);
      },
      error: () => {
        this.overridesLoading.set(false);
        this.overridesError.set('Could not load permission overrides.');
      },
    });
  }

  protected overrideStateFor(key: string): OverrideState {
    return this.overrideStates().get(key) ?? 'inherit';
  }

  protected setOverrideState(key: string, state: OverrideState): void {
    const next = new Map(this.overrideStates());
    if (state === 'inherit') next.delete(key);
    else next.set(key, state);
    this.overrideStates.set(next);
  }

  protected saveOverrides(): void {
    const user = this.selectedUser();
    if (!user) return;

    const byKey = this.catalogActionsByKey();
    const grants: string[] = [];
    const revokes: string[] = [];
    for (const [key, state] of this.overrideStates()) {
      const permissionId = byKey.get(key)?.permissionId;
      if (!permissionId) continue;
      if (state === 'grant') grants.push(permissionId);
      else if (state === 'revoke') revokes.push(permissionId);
    }

    this.savingOverrides.set(true);
    this.overridesError.set(null);
    this.overridesSuccess.set(false);
    this.rbac.setUserPermissionOverrides(user.id, grants, revokes).subscribe({
      next: () => {
        this.savingOverrides.set(false);
        this.overridesSuccess.set(true);
        this.effectivePermissions.set(null);
      },
      error: (err: Error) => {
        this.savingOverrides.set(false);
        this.overridesError.set(err.message || 'Failed to save permission overrides.');
      },
    });
  }

  protected loadEffectivePermissions(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.rbac.effectivePermissions(user.id).subscribe({ next: (permissions) => this.effectivePermissions.set(permissions) });
  }

  private refreshUser(updated: RbacUser): void {
    this.allUsers.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
  }

  protected createUser(): void {
    const name = this.newUserName.trim();
    if (!name) {
      this.createError.set('Name is required.');
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.rbac
      .createUser({
        name,
        email: this.newUserEmail.trim() || undefined,
        phone: this.newUserPhone.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.newUserName = '';
          this.newUserEmail = '';
          this.newUserPhone = '';
          this.loadUsers();
        },
        error: (err: Error) => {
          this.creating.set(false);
          this.createError.set(err.message || 'Failed to create user.');
        },
      });
  }

  protected assignRole(): void {
    const user = this.selectedUser();
    if (!user || !this.addRoleId) return;
    this.detailBusy.set(true);
    this.rbac.assignRole(user.id, this.addRoleId).subscribe({
      next: (updated) => {
        this.detailBusy.set(false);
        this.refreshUser(updated as RbacUser);
        this.addRoleId = '';
      },
      error: (err: Error) => {
        this.detailBusy.set(false);
        this.detailError.set(err.message || 'Failed to assign role.');
      },
    });
  }

  protected removeRole(roleId: string): void {
    const user = this.selectedUser();
    if (!user) return;
    this.detailBusy.set(true);
    this.rbac.removeRole(user.id, roleId).subscribe({
      next: (updated) => {
        this.detailBusy.set(false);
        this.refreshUser(updated as RbacUser);
      },
      error: (err: Error) => {
        this.detailBusy.set(false);
        this.detailError.set(err.message || 'Failed to remove role.');
      },
    });
  }

  protected setStatus(status: UserStatus): void {
    const user = this.selectedUser();
    if (!user) return;
    this.detailBusy.set(true);
    this.rbac.setUserStatus(user.id, status).subscribe({
      next: (updated) => {
        this.detailBusy.set(false);
        this.refreshUser(updated as RbacUser);
      },
      error: (err: Error) => {
        this.detailBusy.set(false);
        this.detailError.set(err.message || 'Failed to update status.');
      },
    });
  }

  protected revokeSessions(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.detailBusy.set(true);
    this.rbac.revokeAllSessions(user.id).subscribe({
      next: (res) => {
        this.detailBusy.set(false);
        this.detailMessage.set(res.message);
      },
      error: (err: Error) => {
        this.detailBusy.set(false);
        this.detailError.set(err.message || 'Failed to revoke sessions.');
      },
    });
  }

  protected resetOtp(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.detailBusy.set(true);
    this.rbac.resetOtp(user.id).subscribe({
      next: (res) => {
        this.detailBusy.set(false);
        this.detailMessage.set(res.message);
      },
      error: (err: Error) => {
        this.detailBusy.set(false);
        this.detailError.set(err.message || 'Failed to reset OTP.');
      },
    });
  }

  protected loadLoginHistory(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.rbac.loginHistory(user.id).subscribe({ next: (rows) => this.loginHistory.set(rows) });
  }

  protected loadSessions(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.rbac.sessions(user.id).subscribe({ next: (rows) => this.sessions.set(rows) });
  }

  protected deleteUser(): void {
    const user = this.selectedUser();
    if (!user) return;
    this.detailBusy.set(true);
    this.rbac.deleteUser(user.id).subscribe({
      next: () => {
        this.detailBusy.set(false);
        this.allUsers.update((list) => list.filter((u) => u.id !== user.id));
        this.selectedUserId.set(null);
      },
      error: (err: Error) => {
        this.detailBusy.set(false);
        this.detailError.set(err.message || 'Failed to delete user.');
      },
    });
  }

  protected async loginAsUser(): Promise<void> {
    const user = this.selectedUser();
    if (!user) return;
    this.detailBusy.set(true);
    try {
      await this.auth.loginAsUser(user.id);
      this.router.navigate(['/account/dashboard']);
    } catch {
      this.detailError.set('Failed to start "Login As" preview.');
    } finally {
      this.detailBusy.set(false);
    }
  }
}
