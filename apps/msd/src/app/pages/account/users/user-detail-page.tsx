import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FilledButton, Icon, OutlinedButton, OutlinedSelect, OutlinedTextField, SelectOption } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import type { UserStatus } from '@skylabs-monorepo/shared-types';
import {
  getLoginHistory,
  getSessions,
  getUser,
  resetOtp,
  revokeAllSessions,
  setUserRole,
  setUserStatus,
  updateUser,
  type UserRecord,
} from '../../../../api/rbac/users';
import { getPermissionCatalog, getRolePermissions, listRoles, type PermissionCatalogRow, type Role } from '../../../../api/rbac/roles';
import { ApiRequestError } from '../../../../api/rbac/client';
import { showSnackbar } from '../../../../snackbar/snackbar';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { ChipNav } from '../../../components/chip-nav/chip-nav';
import { eligibleStaffRoles } from './create-user-dialog';
import { LoginHistoryPanel } from './login-history-panel';
import { SessionsPanel } from './sessions-panel';
import { userDisplayName } from './user-list';
import { validateEmail, validatePhone } from '../../../../utils/validation';
import content from '../../../../content.json';

const SECTIONS = [
  { key: 'profile', label: 'Profile' },
  { key: 'roles', label: 'Roles & Access' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

const STATUS_LABEL: Record<UserStatus, string> = { active: 'Active', inactive: 'Inactive', blocked: 'Blocked' };
function statusBadgeVariant(status: UserStatus): 'primary' | 'tertiary' | 'error' {
  if (status === 'active') return 'primary';
  if (status === 'blocked') return 'error';
  return 'tertiary';
}

/**
 * One staff user's own page: `/account/administration/users/:userId` (Profile, default) and
 * `/account/administration/users/:userId/roles` (Roles & Access) — same real-routes-as-tabs shape
 * as `customer-detail-page.tsx` / `vendor-detail-page.tsx`, so direct URL load, refresh, Back/
 * Forward, and breadcrumbs all just work for free.
 */
export function UserDetailPage() {
  const { userId, section: rawSection } = useParams<{ userId: string; section?: string }>();
  const section = SECTIONS.some((s) => s.key === rawSection) ? (rawSection as SectionKey) : 'profile';
  const navigate = useNavigate();
  const { token, can, bootstrap, loginAsUser } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const canEdit = can('rbac.users', 'edit');
  const canAssign = can('rbac.users', 'assign');
  const canStatusChange = can('rbac.users', 'status_change');
  const canViewRoleDefinitions = can('rbac.roles', 'view');
  const canImpersonate = can('rbac.users', 'custom');

  const viewerIsSuperAdmin = bootstrap?.roles.some((r) => r.isSuperAdmin) ?? false;
  const isOwnRow = bootstrap?.user.id === userId;
  const canSeeLoginInfo = viewerIsSuperAdmin || isOwnRow;

  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [savingRole, setSavingRole] = useState(false);

  const [detailForm, setDetailForm] = useState({ name: '', email: '', phone: '' });
  const [savingDetails, setSavingDetails] = useState(false);

  const [loginHistory, setLoginHistory] = useState<Awaited<ReturnType<typeof getLoginHistory>>['data']>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(false);
  const [loginHistoryError, setLoginHistoryError] = useState('');

  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof getSessions>>['data']>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');

  const [catalog, setCatalog] = useState<PermissionCatalogRow[]>([]);
  const [grantedByRoleId, setGrantedByRoleId] = useState<Record<string, Set<string>>>({});
  const [accessLoading, setAccessLoading] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!userId) return;
      if (!silent) setLoading(true);
      try {
        const { data } = await getUser(token, userId);
        setUser(data);
        setLoadError('');
        setDetailForm({ name: data.name, email: data.email ?? '', phone: data.phone ?? '' });
        setSelectedRoleId(data.roles[0]?.id ?? '');
      } catch (err) {
        if (!silent) setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this user.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, userId],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listRoles(token)
      .then(({ data }) => setAllRoles(data))
      .catch(() => setAllRoles([]));
  }, [token]);

  useEffect(() => {
    if (!userId || !canSeeLoginInfo) return;
    setLoginHistoryLoading(true);
    setLoginHistoryError('');
    getLoginHistory(token, userId)
      .then(({ data }) => setLoginHistory(data))
      .catch((err) => setLoginHistoryError(err instanceof ApiRequestError ? err.message : 'Could not load login history.'))
      .finally(() => setLoginHistoryLoading(false));

    setSessionsLoading(true);
    setSessionsError('');
    getSessions(token, userId)
      .then(({ data }) => setSessions(data))
      .catch((err) => setSessionsError(err instanceof ApiRequestError ? err.message : 'Could not load sessions.'))
      .finally(() => setSessionsLoading(false));
  }, [token, userId, canSeeLoginInfo]);

  // Effective access (read-only) is only shown when the viewer actually holds `rbac.roles:view`
  // (e.g. a genuine SuperAdmin) — Admin's matrix grant never includes it, so Admin's Roles &
  // Access tab shows the assigned role names only, honestly, rather than fabricating a
  // permission breakdown it has no right to read.
  useEffect(() => {
    if (section !== 'roles' || !canViewRoleDefinitions || !user) return;
    setAccessLoading(true);
    Promise.all([
      getPermissionCatalog(token),
      ...user.roles.map((r) => getRolePermissions(token, r.id).then(({ data }) => [r.id, data.map((p) => p.permissionId)] as const)),
    ])
      .then(([catalogResult, ...roleResults]) => {
        setCatalog(catalogResult.data);
        setGrantedByRoleId(Object.fromEntries(roleResults.map(([roleId, ids]) => [roleId, new Set(ids)])));
      })
      .catch(() => {
        setCatalog([]);
        setGrantedByRoleId({});
      })
      .finally(() => setAccessLoading(false));
  }, [section, canViewRoleDefinitions, token, user]);

  const name = user ? userDisplayName(user) : 'User';
  const SECTION_LABEL: Record<SectionKey, string> = { profile: 'Profile', roles: 'Roles & Access' };
  useSetBreadcrumbs(
    user
      ? [
          { label: 'Administration', to: '/account/administration/users' },
          { label: 'Users', to: '/account/administration/users' },
          { label: name, to: `/account/administration/users/${userId}` },
          ...(section === 'roles' ? [{ label: SECTION_LABEL.roles }] : []),
        ]
      : [{ label: 'Administration', to: '/account/administration/users' }, { label: 'Users', to: '/account/administration/users' }],
  );

  const saveDetails = async () => {
    if (!user) return;
    const email = detailForm.email.trim();
    const phone = detailForm.phone.trim();

    if (email && !validateEmail(email)) {
      showSnackbar(content.validation.email.invalid, { variant: 'error' });
      return;
    }
    if (phone && !validatePhone(phone)) {
      showSnackbar(content.validation.phone.invalid, { variant: 'error' });
      return;
    }

    setSavingDetails(true);
    try {
      const { data } = await updateUser(token, user.id, { name: detailForm.name, email: email || undefined, phone: phone || undefined });
      setUser(data);
      showSnackbar('User details saved.');
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not save user details.', { variant: 'error' });
    } finally {
      setSavingDetails(false);
    }
  };

  const changeStatus = async (status: UserStatus) => {
    if (!user) return;
    if (!(await confirm(`Change ${name}'s account status to ${STATUS_LABEL[status]}?`))) return;
    try {
      const { data } = await setUserStatus(token, user.id, status);
      setUser(data);
      showSnackbar('Account status updated.');
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not change account status.', { variant: 'error' });
    }
  };

  // Atomic single-role replace — never additive, never appends to the previous assignment. The
  // user's saved role set (and therefore their effective permissions) only actually changes once
  // this succeeds; a cache/bootstrap refresh for the AFFECTED user happens through the existing
  // 30s permission-cache invalidation the backend already does on this same request, and through
  // their own next bootstrap refetch (sign-in/token-refresh) — same mechanism as every other
  // role-permission change in this app, not something this page needs to reinvent.
  const saveRole = async () => {
    if (!user || !selectedRoleId) return;
    setSavingRole(true);
    try {
      const { data } = await setUserRole(token, user.id, selectedRoleId);
      setUser(data);
      setSelectedRoleId(data.roles[0]?.id ?? '');
      showSnackbar('Role updated.');
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not update role.', { variant: 'error' });
    } finally {
      setSavingRole(false);
    }
  };

  const doRevokeSessions = async () => {
    if (!user) return;
    if (!(await confirm(`Revoke every active session for ${name}? They'll be signed out everywhere.`))) return;
    try {
      await revokeAllSessions(token, user.id);
      showSnackbar('All sessions revoked.', { variant: 'success' });
      const { data } = await getSessions(token, user.id);
      setSessions(data);
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not revoke sessions.', { variant: 'error' });
    }
  };

  const doLoginAs = async () => {
    if (!user) return;
    try {
      await loginAsUser(user.id);
      navigate('/account/dashboard');
    } catch {
      showSnackbar('Could not start preview session.', { variant: 'error' });
    }
  };

  const doResetOtp = async () => {
    if (!user) return;
    try {
      await resetOtp(token, user.id);
      showSnackbar('Pending OTP challenges invalidated.');
    } catch (err) {
      showSnackbar(err instanceof ApiRequestError ? err.message : 'Could not reset OTP.', { variant: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="loading-state">Loading user…</p>
      </div>
    );
  }
  if (loadError || !user) {
    return (
      <div className="admin-page admin-page--wide">
        <p className="error-state" role="alert">{loadError || 'User not found.'}</p>
        <Link to="/account/administration/users">Back to Users</Link>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>{`${name} · ${SECTION_LABEL[section]} · MSD`}</title>
      <header className="page-head">
        <div>
          <h1>{name}</h1>
          <p>
            <sky-badge variant={statusBadgeVariant(user.status)}>{STATUS_LABEL[user.status]}</sky-badge>
          </p>
          <p className="field-hint">{[user.phone, user.email].filter(Boolean).join(' · ') || 'No contact on file'}</p>
          <p className="field-hint">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
        </div>
        {canImpersonate && (
          <div className="page-head__actions">
            <OutlinedButton onClick={doLoginAs}>
              <Icon slot="icon" aria-hidden="true">visibility</Icon>
              Login as
            </OutlinedButton>
          </div>
        )}
      </header>

      <ChipNav
        items={SECTIONS.map((s) => ({ value: s.key, label: s.label }))}
        value={section}
        onSelect={(value) => navigate(value === 'profile' ? `/account/administration/users/${userId}` : `/account/administration/users/${userId}/${value}`)}
        ariaLabel="User detail sections"
      />

      {section === 'profile' && (
        <div className="admin-tab-panel" aria-label="Profile">
          <h2 className="section-title">Contact details</h2>
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
              <OutlinedSelect label="Status" value={user.status} onChange={(e: Event) => changeStatus((e.target as HTMLSelectElement).value as UserStatus)}>
                <SelectOption value="active"><div slot="headline">Active</div></SelectOption>
                <SelectOption value="inactive"><div slot="headline">Inactive</div></SelectOption>
                <SelectOption value="blocked"><div slot="headline">Blocked</div></SelectOption>
              </OutlinedSelect>
            )}
            {canEdit && (
              <div className="form-actions">
                <FilledButton onClick={saveDetails} disabled={savingDetails}>
                  {savingDetails ? 'Saving…' : 'Save changes'}
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

          {canSeeLoginInfo ? (
            <>
              <h2 className="section-title">Login history</h2>
              <LoginHistoryPanel entries={loginHistory} loading={loginHistoryLoading} error={loginHistoryError} />

              <h2 className="section-title">Sessions</h2>
              <SessionsPanel sessions={sessions} loading={sessionsLoading} error={sessionsError} />
            </>
          ) : (
            <p className="field-hint">Login history and active sessions are only visible for your own account.</p>
          )}
        </div>
      )}

      {section === 'roles' && (
        <div className="admin-tab-panel" aria-label="Roles & Access">
          <h2 className="section-title">Assigned role</h2>
          <p className="field-hint">Every staff account holds exactly one role — saving replaces it atomically, it never adds to the existing assignment.</p>
          <div className="form-grid">
            <OutlinedSelect
              label="Role"
              value={selectedRoleId}
              disabled={!canAssign}
              onChange={(e: Event) => setSelectedRoleId((e.target as HTMLSelectElement).value)}
            >
              {eligibleStaffRoles(allRoles).map((role) => (
                <SelectOption key={role.id} value={role.id}>
                  <div slot="headline">{role.name}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
            {canAssign && (
              <div className="form-actions">
                <FilledButton onClick={saveRole} disabled={savingRole || !selectedRoleId || selectedRoleId === user.roles[0]?.id}>
                  {savingRole ? 'Saving…' : 'Save role'}
                </FilledButton>
              </div>
            )}
          </div>

          <h2 className="section-title">Effective access</h2>
          {!canViewRoleDefinitions ? (
            <p className="field-hint">You don't have permission to view the detailed permission breakdown for these roles.</p>
          ) : accessLoading ? (
            <p className="loading-state">Loading effective access…</p>
          ) : user.roles.length === 0 ? (
            <p className="empty-state">No roles assigned — this user has no access.</p>
          ) : (
            user.roles.map((role) => {
              const granted = grantedByRoleId[role.id] ?? new Set<string>();
              const rows = catalog
                .map((row) => ({ ...row, actions: row.actions.filter((a) => a.permissionIds.some((id) => granted.has(id))) }))
                .filter((row) => row.actions.length > 0);
              return (
                <sky-card key={role.id} aria-label={`${role.name} effective access`}>
                  <div className="section-title" style={{ padding: '12px 16px 0' }}>{role.name}</div>
                  {rows.length === 0 ? (
                    <p className="empty-state" style={{ padding: '0 16px 12px' }}>No permissions granted.</p>
                  ) : (
                    <ul className="entity-list">
                      {rows.map((row) => (
                        <li key={row.id} className="widget-assign-row">
                          <span>{row.title}</span>
                          <span className="field-hint">{row.actions.map((a) => a.action).join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </sky-card>
              );
            })
          )}
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}

export default UserDetailPage;
