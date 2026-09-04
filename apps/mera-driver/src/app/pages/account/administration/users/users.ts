import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, HasPermissionDirective } from '@skylabs-monorepo/shared-auth/angular';
import type { DeviceSession, LoginHistoryEntry, Role, User, UserStatus } from '@skylabs-monorepo/shared-types';
import type { SkyDataTableAction, SkyDataTableColumn, SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { RbacApiService } from '../../../../core/rbac/rbac-api.service';

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

  // Create user ----------------------------------------------------------
  protected newUserName = '';
  protected newUserEmail = '';
  protected newUserPhone = '';
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  constructor() {
    this.loadUsers();
    this.rbac.listRoles().subscribe({ next: (roles) => this.roles.set(roles) });
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
  }

  protected closeDetail(): void {
    this.selectedUserId.set(null);
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
