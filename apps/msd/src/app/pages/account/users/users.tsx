import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, OutlinedTextField, OutlinedSelect, SelectOption, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import type { UserStatus, LoginHistoryEntry, DeviceSession } from '@skylabs-monorepo/shared-types';
import {
  assignRole,
  getLoginHistory,
  getSessions,
  listUsers,
  resetOtp,
  revokeAllSessions,
  setUserStatus,
  unassignRole,
  updateUser,
  type UserRecord,
} from '../../../../api/rbac/users';
import { listRoles, type Role } from '../../../../api/rbac/roles';
import { ApiRequestError } from '../../../../api/rbac/client';
import { UserList } from './user-list';
import { RoleAssignment } from './role-assignment';
import { LoginHistoryPanel } from './login-history-panel';
import { SessionsPanel } from './sessions-panel';
import { CreateUserDialog } from './create-user-dialog';

const PAGE_SIZE = 20;

export function UserManagement() {
  const { token, can, loginAsUser } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [search, setSearch] = useState('');

  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);
  const [loginHistoryError, setLoginHistoryError] = useState('');

  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');

  const [detailForm, setDetailForm] = useState({ name: '', email: '', phone: '' });
  const [savingDetails, setSavingDetails] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const canEdit = can('rbac.users', 'edit');
  const canAssign = can('rbac.users', 'assign');
  const canStatusChange = can('rbac.users', 'status_change');
  const canCreate = can('rbac.users', 'create');
  const canImpersonate = can('rbac.users', 'custom');

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const { data, meta } = await listUsers(token, page, PAGE_SIZE);
      setUsers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setUsersError(err instanceof ApiRequestError ? err.message : 'Could not load users.');
    } finally {
      setUsersLoading(false);
    }
  }, [token, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    listRoles(token)
      .then(({ data }) => setAllRoles(data))
      .catch(() => setAllRoles([]));
  }, [token]);

  useEffect(() => {
    if (selectedUser) {
      setDetailForm({ name: selectedUser.name, email: selectedUser.email ?? '', phone: selectedUser.phone ?? '' });
    }
    setActionMessage('');
    setActionError('');
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUserId) return;
    setLoginHistoryLoading(true);
    setLoginHistoryError('');
    getLoginHistory(token, selectedUserId)
      .then(({ data }) => setLoginHistory(data))
      .catch((err) => setLoginHistoryError(err instanceof ApiRequestError ? err.message : 'Could not load login history.'))
      .finally(() => setLoginHistoryLoading(false));

    setSessionsLoading(true);
    setSessionsError('');
    getSessions(token, selectedUserId)
      .then(({ data }) => setSessions(data))
      .catch((err) => setSessionsError(err instanceof ApiRequestError ? err.message : 'Could not load sessions.'))
      .finally(() => setSessionsLoading(false));
  }, [token, selectedUserId]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q),
    );
  }, [users, search]);

  const assignedRoleIds = useMemo(() => new Set((selectedUser?.roles ?? []).map((r) => r.id)), [selectedUser]);

  const saveDetails = async () => {
    if (!selectedUser) return;
    setSavingDetails(true);
    setActionError('');
    try {
      const { data } = await updateUser(token, selectedUser.id, {
        name: detailForm.name,
        email: detailForm.email || undefined,
        phone: detailForm.phone || undefined,
      });
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
      setActionMessage('User details saved.');
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not save user details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const changeStatus = async (status: UserStatus) => {
    if (!selectedUser) return;
    try {
      const { data } = await setUserStatus(token, selectedUser.id, status);
      setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not change user status.');
    }
  };

  const toggleUserRole = async (roleId: string, nowAssigned: boolean) => {
    if (!selectedUser) return;
    setRoleBusyId(roleId);
    setActionError('');
    try {
      if (nowAssigned) {
        await assignRole(token, selectedUser.id, roleId);
      } else {
        await unassignRole(token, selectedUser.id, roleId);
      }
      const role = allRoles.find((r) => r.id === roleId);
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== selectedUser.id) return u;
          const roles = nowAssigned
            ? [...u.roles, ...(role ? [{ id: role.id, key: role.key, name: role.name }] : [])]
            : u.roles.filter((r) => r.id !== roleId);
          return { ...u, roles };
        }),
      );
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not update role assignment.');
    } finally {
      setRoleBusyId(null);
    }
  };

  const doRevokeSessions = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Revoke every active session for ${selectedUser.name}? They'll be signed out everywhere.`)) return;
    try {
      await revokeAllSessions(token, selectedUser.id);
      setActionMessage('All sessions revoked.');
      const { data } = await getSessions(token, selectedUser.id);
      setSessions(data);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not revoke sessions.');
    }
  };

  const doResetOtp = async () => {
    if (!selectedUser) return;
    try {
      await resetOtp(token, selectedUser.id);
      setActionMessage('Pending OTP challenges invalidated.');
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : 'Could not reset OTP.');
    }
  };

  const doLoginAs = async (userId: string) => {
    try {
      await loginAsUser(userId);
      navigate('/account/dashboard');
    } catch {
      setActionError('Could not start preview session.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--wide">
      <title>User Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>User Management</h1>
          <p>Search staff and customer accounts, manage their roles and access.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <CreateUserDialog roles={allRoles} onCreated={(user) => setUsers((prev) => [user, ...prev])} />
          )}
        </div>
      </header>

      <div className="two-pane">
        <section className="panel" aria-label="Users">
          <h2>Users</h2>
          <OutlinedTextField
            className="admin-sidebar__search"
            label="Search this page"
            value={search}
            onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
          />
          {usersLoading ? (
            <p className="loading-state">Loading users…</p>
          ) : usersError ? (
            <p className="error-state">{usersError}</p>
          ) : (
            <>
              <UserList users={filteredUsers} selectedId={selectedUserId} onSelect={setSelectedUserId} />
              <div className="form-actions">
                <OutlinedButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </OutlinedButton>
                <span className="field-hint">
                  Page {page} of {totalPages}
                </span>
                <OutlinedButton disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </OutlinedButton>
              </div>
            </>
          )}
        </section>

        <section className="panel" aria-label="User details">
          {!selectedUser ? (
            <p className="empty-state">Select a user to view their profile, roles, and history.</p>
          ) : (
            <>
              <div className="page-head">
                <div>
                  <h2>{selectedUser.name}</h2>
                  <p className="field-hint">Last login: {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : 'Never'}</p>
                </div>
                <div className="page-head__actions">
                  {canImpersonate && (
                    <OutlinedButton onClick={() => doLoginAs(selectedUser.id)}>
                      <Icon slot="icon" aria-hidden="true">visibility</Icon>
                      Login as
                    </OutlinedButton>
                  )}
                </div>
              </div>

              {actionMessage && <p className="field-hint" role="status">{actionMessage}</p>}
              {actionError && <p className="error-state" role="alert">{actionError}</p>}

              <div className="form-grid">
                <OutlinedTextField
                  label="Name"
                  value={detailForm.name}
                  disabled={!canEdit}
                  onInput={(e: Event) => setDetailForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))}
                />
                <OutlinedTextField
                  label="Email"
                  type="email"
                  value={detailForm.email}
                  disabled={!canEdit}
                  onInput={(e: Event) => setDetailForm((f) => ({ ...f, email: (e.target as HTMLInputElement).value }))}
                />
                <OutlinedTextField
                  label="Phone"
                  type="tel"
                  value={detailForm.phone}
                  disabled={!canEdit}
                  onInput={(e: Event) => setDetailForm((f) => ({ ...f, phone: (e.target as HTMLInputElement).value }))}
                />
                {canStatusChange && (
                  <OutlinedSelect
                    label="Status"
                    value={selectedUser.status}
                    onChange={(e: Event) => changeStatus((e.target as HTMLSelectElement).value as UserStatus)}
                  >
                    <SelectOption value="active">
                      <div slot="headline">Active</div>
                    </SelectOption>
                    <SelectOption value="inactive">
                      <div slot="headline">Inactive</div>
                    </SelectOption>
                    <SelectOption value="blocked">
                      <div slot="headline">Blocked</div>
                    </SelectOption>
                  </OutlinedSelect>
                )}
                {canEdit && (
                  <div className="form-actions">
                    <FilledButton onClick={saveDetails} disabled={savingDetails}>
                      {savingDetails ? 'Saving…' : 'Save details'}
                    </FilledButton>
                  </div>
                )}
              </div>

              {canEdit && (
                <div className="page-head__actions">
                  <OutlinedButton onClick={doRevokeSessions}>
                    <Icon slot="icon" aria-hidden="true">lock_reset</Icon>
                    Revoke all sessions
                  </OutlinedButton>
                  <OutlinedButton onClick={doResetOtp}>
                    <Icon slot="icon" aria-hidden="true">password</Icon>
                    Reset OTP
                  </OutlinedButton>
                </div>
              )}

              <h2 className="section-title">Roles</h2>
              <RoleAssignment
                allRoles={allRoles}
                assignedRoleIds={assignedRoleIds}
                onToggle={toggleUserRole}
                disabled={!canAssign}
                busyRoleId={roleBusyId}
              />

              <h2 className="section-title">Login history</h2>
              <LoginHistoryPanel entries={loginHistory} loading={loginHistoryLoading} error={loginHistoryError} />

              <h2 className="section-title">Sessions</h2>
              <SessionsPanel sessions={sessions} loading={sessionsLoading} error={sessionsError} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default UserManagement;
