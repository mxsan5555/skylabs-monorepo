import { useCallback, useEffect, useState } from 'react';
import { OutlinedSelect, SelectOption, FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listRoleConflicts, resolveRoleConflict, type RoleConflictAccount } from '../../../../api/rbac/users';
import { listRoles, type Role } from '../../../../api/rbac/roles';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { userDisplayName } from './user-list';

/**
 * Legacy multiple-role accounts the single-role migration sweep couldn't convert automatically
 * (see `prisma/role-migration.ts`'s own doc comment) — every account here holds `User.roleConflict
 * = true` and still has more than one current role. An authorized admin (`rbac.users:assign`,
 * same permission as any other role change) must pick one explicit final role per account; this
 * screen never guesses, unions, or auto-picks on its own.
 */
export function RoleConflictsPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  useSetBreadcrumbs([
    { label: 'Administration', to: '/account/administration/users' },
    { label: 'Users', to: '/account/administration/users' },
    { label: 'Role Conflicts' },
  ]);

  const [accounts, setAccounts] = useState<RoleConflictAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await listRoleConflicts(token);
      setAccounts(data);
    } catch (err) {
      setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load flagged accounts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Every role is offered here (unlike the staff role dropdown) — the correct resolution for a
    // flagged account may genuinely be Customer or Member, not only an internal staff role.
    listRoles(token)
      .then(({ data }) => setAllRoles(data))
      .catch(() => setAllRoles([]));
  }, [token]);

  const resolve = async (account: RoleConflictAccount) => {
    const roleId = choices[account.id];
    if (!roleId) {
      showToast('Pick a final role before resolving.', 'error');
      return;
    }
    const chosenRole = allRoles.find((r) => r.id === roleId);
    if (!(await confirm(`Set ${userDisplayName(account)}'s account role to "${chosenRole?.name ?? 'the selected role'}"? This replaces every other role currently held.`))) {
      return;
    }
    setResolvingId(account.id);
    try {
      await resolveRoleConflict(token, account.id, roleId);
      showToast('Account role resolved.');
      await load();
    } catch (err) {
      showToast(err instanceof ApiRequestError ? err.message : 'Could not resolve this account.', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Role Conflicts · MSD</title>
      <header className="page-head">
        <div>
          <h1>Role Conflicts</h1>
          <p>Legacy accounts still holding more than one role — pick one explicit final role for each.</p>
        </div>
      </header>

      {loading ? (
        <p className="loading-state">Loading flagged accounts…</p>
      ) : loadError ? (
        <p className="error-state" role="alert">{loadError}</p>
      ) : accounts.length === 0 ? (
        <p className="empty-state">No accounts need review.</p>
      ) : (
        <ul className="entity-list">
          {accounts.map((account) => (
            <li key={account.id} className="widget-assign-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div>
                <strong>{userDisplayName(account)}</strong>
                <p className="field-hint">{[account.phone, account.email].filter(Boolean).join(' · ') || 'No contact on file'}</p>
                <p className="field-hint">
                  Currently holds: {account.roles.map((r) => r.name).join(', ')}
                  {account.vendorProfile && ` · Owns a Member business: ${account.vendorProfile.businessName ?? '(unnamed)'}`}
                </p>
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: 'auto auto', alignItems: 'end' }}>
                <OutlinedSelect
                  label="Final role"
                  value={choices[account.id] ?? ''}
                  onChange={(e: Event) => setChoices((prev) => ({ ...prev, [account.id]: (e.target as HTMLSelectElement).value }))}
                >
                  {allRoles.map((role) => (
                    <SelectOption key={role.id} value={role.id}>
                      <div slot="headline">{role.name}</div>
                    </SelectOption>
                  ))}
                </OutlinedSelect>
                <FilledButton onClick={() => resolve(account)} disabled={resolvingId === account.id}>
                  {resolvingId === account.id ? 'Resolving…' : 'Resolve'}
                </FilledButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {ConfirmDialog}
    </div>
  );
}

export default RoleConflictsPage;
