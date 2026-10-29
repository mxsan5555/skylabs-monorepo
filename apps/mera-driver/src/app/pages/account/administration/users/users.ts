import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, HasPermissionDirective } from '@skylabs-monorepo/shared-auth/angular';
import type { DeviceSession, LoginHistoryEntry, Role, User, UserStatus } from '@skylabs-monorepo/shared-types';
import type { SkyDataTableAction, SkyDataTableColumn, SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { AdminPage } from '../../../../admin/admin-page/admin-page';
import { RbacApiService } from '../../../../core/rbac/rbac-api.service';

type RbacUser = User & { roles: { role: Role }[]; createdBy?: string | null; permissionOverrides?: {effect: string; permission: {key:string}}[] };

interface UserRow {
  id: string;
  name: string;
  contact: string;
  roles: string;
  status: UserStatus;
  createdBy: string;
}

const COLUMNS: SkyDataTableColumn[] = [
  { key: 'name', label: 'User', sortable: true },
  { key: 'contact', label: 'Email / Phone' },
  { key: 'roles', label: 'Role(s)' },
  {
    key: 'status',
    label: 'Status',
    type: 'status',
    statusMap: { active: 'success', inactive: 'warning', blocked: 'error' },
  },
  { key: 'createdBy', label: 'Created By' },
];

const ACTIONS: SkyDataTableAction[] = [
  { icon: 'edit', label: 'Edit', event: 'manage' },
];

/** Staff management reuses server filtering, the shared table and existing role/session APIs. */
@Component({
  selector: 'md-administration-users',
  imports: [AdminPage, HasPermissionDirective],
  templateUrl: './users.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AdministrationUsers {
  private readonly rbac = inject(RbacApiService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly formOpen = signal(false);
  protected readonly roleFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly serverTotal = signal(0);
  private listSequence = 0;
  protected editName = '';
  protected editEmail = '';
  protected editPhone = '';
  protected editStatus: UserStatus = 'active';
  // Single-select role — one staff user holds exactly one role (see `assertSingleStaffRoleIntent`
  // in `user.service.ts`). `null` means "not yet explicitly chosen": for a single-role user that's
  // the pre-reconciliation moment before `selectUser` preselects it; for a legacy multi-role user
  // (from before this constraint existed) it's left unset on purpose — see `needsRoleReconciliation`.
  protected readonly editRoleId = signal<string | null>(null);
  protected readonly roleTouched = signal(false);
  protected setDraftRole(id: string): void { this.editRoleId.set(id || null); this.roleTouched.set(true); }
  /** A legacy user holding more than one staff role — never silently collapsed to "the first
   *  one"; the dropdown starts unset and the admin must explicitly pick the final role. */
  protected readonly needsRoleReconciliation = computed(() => (this.selectedUser()?.roles.filter(link => !['driver','customer'].includes(link.role.key)).length ?? 0) > 1);

  /** Read-only summary of a role's access — shown next to the Add/Edit role dropdown so an
   *  admin can see what they're about to grant before saving. */
  protected roleAccessSummary(roleId: string | null): string | null {
    if (!roleId) return null;
    const role = this.roles().find((r) => r.id === roleId);
    return role ? `Uses this role's saved permissions and supported record scope. ${role.description ?? ''}` : null;
  }
  protected selectedRoleAccessSummary(): string | null { return this.roleAccessSummary(this.editRoleId()); }
  protected newRoleId = '';
  protected newUserStatus:UserStatus='active';
  protected readonly canChangeStatus=computed(()=>this.auth.can('rbac.users','status_change'));
  protected startAdd(): void { this.selectedUserId.set(null); this.formOpen.set(true); this.newUserName='';this.newUserEmail='';this.newUserPhone='';this.newRoleId='';this.newUserStatus='active';this.createError.set(null); }
  protected applyFilters(): void { this.page.set(1);this.loadUsers(); }
  protected saveChanges(): void {
    const user=this.selectedUser();if(!user || this.detailBusy() || !this.auth.can('rbac.users','edit'))return;
    if((user.email&&!this.editEmail.trim())||(user.phone&&!this.editPhone.trim())) {this.detailError.set('Removing a saved login identifier is not supported here. Edit its value or cancel.');return;}
    this.detailBusy.set(true);this.detailError.set(null);
    // `roleIds` is only ever included when the admin actually touched the dropdown — an
    // untouched multi-role legacy user keeps its existing roles exactly as-is rather than
    // being silently collapsed to one (see `needsRoleReconciliation`).
    this.rbac.updateUser(user.id,{name:this.editName.trim(),email:this.editEmail.trim() || undefined,phone:this.editPhone.trim() || undefined,...(this.editStatus!==user.status?{status:this.editStatus}:{}),...(this.roleTouched()?{roleIds:this.editRoleId()?[this.editRoleId()!]:[]}:{})}).subscribe({next:updated=>{this.detailBusy.set(false);this.refreshUser({...updated,createdBy:user.createdBy} as RbacUser);this.detailMessage.set('Changes saved.');void this.rbac.refreshAuthorization();},error:err=>{this.detailBusy.set(false);this.detailError.set(err.error?.error?.message || err.message || 'Failed to save changes.');}});
  }
  protected readonly allUsers = signal<RbacUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly roles = signal<Role[]>([]);
  protected readonly rolesLoading = signal(true);
  protected readonly rolesError = signal<string | null>(null);
  protected readonly editRoles = computed(() => {
    const roles = [...this.roles()];
    for (const link of this.selectedUser()?.roles ?? []) if (!['driver','customer'].includes(link.role.key) && !roles.some(r => r.id === link.role.id)) roles.push(link.role);
    return roles;
  });

  protected readonly search = signal('');
  protected readonly sortKey = signal('');
  protected readonly sortDir = signal<'asc' | 'desc' | ''>('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);

  protected readonly columns = COLUMNS;
  protected readonly actions = ACTIONS;

  protected readonly total = computed(() => this.serverTotal());
  protected readonly rows = computed<UserRow[]>(() => this.allUsers().map(u => ({id:u.id,name:u.name,contact:[u.email,u.phone].filter(Boolean).join(' / ') || '?',roles:u.roles.map(r=>r.role.name).join(', ') || '?',status:u.status,createdBy:u.createdBy || 'Not recorded'})));

  protected readonly rowsJson = computed(() => JSON.stringify(this.rows()));
  protected readonly columnsJson = JSON.stringify(this.columns);
  protected readonly actionsJson = computed(() => JSON.stringify(this.auth.can('rbac.users','edit') ? this.actions : []));

  // Detail panel ----------------------------------------------------------
  protected readonly selectedUserId = signal<string | null>(null);
  protected readonly selectedUser = computed(() =>
    this.allUsers().find((u) => u.id === this.selectedUserId()),
  );
  protected readonly accessConflicts = computed(() => this.selectedUser()?.permissionOverrides?.map(o => `Direct ${o.effect}: ${o.permission.key}`) ?? []);
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
    this.rbac.assignableRoles().subscribe({ next: roles => { this.roles.set(roles.filter(r => r.isActive && !['customer','driver'].includes(r.key))); this.rolesLoading.set(false); }, error: () => {this.rolesLoading.set(false);this.rolesError.set('Could not load assignable roles. Reload before changing a role.');} });
  }

  private loadUsers(): void {
    const sequence = ++this.listSequence;
    this.loading.set(true);
    this.loadError.set(null);
    this.rbac.listUsers(this.page(), this.pageSize(), {search:this.search(),roleId:this.roleFilter(),status:this.statusFilter(),sort:this.sortKey(),direction:this.sortDir()}).subscribe({
      next: (page) => {
        if (sequence !== this.listSequence) return;
        this.serverTotal.set(page.total);
        this.allUsers.set(page.items);
        this.loading.set(false);
      },
      error: () => {
        if (sequence !== this.listSequence) return;
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
    this.loadUsers();
  }

  protected onRowAction(event: Event): void {
    const detail = (event as CustomEvent<{ action: string; row: UserRow }>).detail;
    if (detail.action === 'manage') this.selectUser(detail.row.id);
  }

  protected selectUser(id: string): void {
    if(this.detailBusy())return;
    this.formOpen.set(true);
    const user = this.allUsers().find(u=>u.id===id);
    this.editName=user?.name ?? '';this.editEmail=user?.email ?? '';this.editPhone=user?.phone ?? '';this.editStatus=user?.status??'active';
    // A multi-role legacy user starts unset (forces an explicit reconciliation choice); a
    // single-role (or role-less) user preselects what they already hold.
    const staffRoles = user?.roles.filter(link => !['driver','customer'].includes(link.role.key)) ?? [];
    this.editRoleId.set(staffRoles.length === 1 ? staffRoles[0].role.id : null);
    this.roleTouched.set(false);
    this.selectedUserId.set(id);
    this.addRoleId = '';
    this.detailError.set(null);
    this.detailMessage.set(null);
    this.loginHistory.set(null);
    this.sessions.set(null);

  }

  protected closeDetail(): void {
    if(this.detailBusy()||this.creating())return;
    this.formOpen.set(false);
    this.selectedUserId.set(null);
  }

  private refreshUser(updated: RbacUser): void {
    this.allUsers.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
  }

  protected createUser(): void {
    const name = this.newUserName.trim();
    if (!name || (!this.newUserEmail.trim() && !this.newUserPhone.trim())) {
      this.createError.set('Name and an email or phone login identifier are required.');
      return;
    }
    this.creating.set(true);
    this.createError.set(null);
    this.rbac
      .createUser({
        name,
        email: this.newUserEmail.trim() || undefined,
        phone: this.newUserPhone.trim() || undefined,
        roleIds: this.newRoleId ? [this.newRoleId] : [],
        ...(this.newUserStatus!=='active'?{status:this.newUserStatus}:{}),
      })
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.newUserName = '';
          this.newUserEmail = '';
          this.newUserPhone = '';
          this.formOpen.set(false);
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
