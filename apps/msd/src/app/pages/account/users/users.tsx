import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { OutlinedSelect, SelectOption } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listUsers, type UserRecord } from '../../../../api/rbac/users';
import { listRoles, type Role } from '../../../../api/rbac/roles';
import { ApiRequestError } from '../../../../api/rbac/client';
import { UserList } from './user-list';
import { CreateUserDialog } from './create-user-dialog';

interface UserTableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: UserTableParams = { page: 1, pageSize: 20, search: '' };

/**
 * Internal Staff directory (`/account/administration/users`, `rbac.users:view`) — list only;
 * each row opens that user's own full page (`/account/administration/users/:userId`, see
 * `user-detail-page.tsx`), same List -> Details split as Member Management and Customer
 * Management. Staff-only by construction: the backend (`user.service.ts#listUsers`) already
 * excludes customer-only and Vendor-owner accounts from every call here, so this page never has
 * to filter them out client-side.
 *
 * List page/pageSize/search/role are all mirrored into the URL
 * (`?page=&pageSize=&search=&role=`) — same reason as `customers.tsx` — the browser's Back
 * button restores this exact querystring after a staff member's detail page has fully unmounted
 * this component.
 */
export function UserManagement() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreate = can('rbac.users', 'create');
  const canAssign = can('rbac.users', 'assign');

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [allRoles, setAllRoles] = useState<Role[]>([]);

  const params = useMemo<UserTableParams>(
    () => ({
      page: Number(searchParams.get('page')) || DEFAULT_PARAMS.page,
      pageSize: Number(searchParams.get('pageSize')) || DEFAULT_PARAMS.pageSize,
      search: searchParams.get('search') ?? DEFAULT_PARAMS.search,
    }),
    [searchParams],
  );
  /** '' = All. Superadmin itself is never offered here — that role is excluded from this list
   *  server-side (see `user.service.ts#listUsers`'s own doc comment), so filtering by it would
   *  always return zero rows. */
  const roleFilter = searchParams.get('role') ?? '';

  const setParams = useCallback(
    (next: UserTableParams) => {
      setSearchParams(
        (prev) => {
          const usp = new URLSearchParams(prev);
          usp.set('page', String(next.page));
          usp.set('pageSize', String(next.pageSize));
          if (next.search) usp.set('search', next.search);
          else usp.delete('search');
          return usp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setRoleFilter = useCallback(
    (role: string) => {
      setSearchParams(
        (prev) => {
          const usp = new URLSearchParams(prev);
          if (role) usp.set('role', role);
          else usp.delete('role');
          usp.set('page', '1');
          return usp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const { data, meta } = await listUsers(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        roleKey: roleFilter || undefined,
      });
      setUsers(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setListError(err instanceof ApiRequestError ? err.message : 'Could not load staff users.');
    } finally {
      setLoading(false);
    }
  }, [token, params, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    listRoles(token)
      .then(({ data }) => setAllRoles(data))
      .catch(() => setAllRoles([]));
  }, [token]);

  const openUser = useCallback((id: string) => navigate(`/account/administration/users/${id}`), [navigate]);

  return (
    <div className="admin-page admin-page--wide">
      <title>User Management · MSD</title>
      <header className="page-head">
        <div>
          <h1>User Management</h1>
          <p>Internal staff accounts — search, roles, and account status.</p>
        </div>
        <div className="page-head__actions">
          {canAssign && <Link to="/account/administration/role-conflicts">Role Conflicts</Link>}
          {canCreate && (
            <CreateUserDialog roles={allRoles} onCreated={() => loadUsers()} />
          )}
        </div>
      </header>

      <section className="panel" aria-label="Staff users">
        <h2>Staff users ({total})</h2>
        <OutlinedSelect label="Role" value={roleFilter} onChange={(e: Event) => setRoleFilter((e.target as HTMLSelectElement).value)}>
          <SelectOption value="">
            <div slot="headline">All</div>
          </SelectOption>
          {allRoles
            .filter((r) => !r.isSuperAdmin)
            .map((r) => (
              <SelectOption key={r.id} value={r.key}>
                <div slot="headline">{r.name}</div>
              </SelectOption>
            ))}
        </OutlinedSelect>
        {listError && <p className="error-state" role="alert">{listError}</p>}
        <UserList
          users={users}
          total={total}
          page={params.page}
          pageSize={params.pageSize}
          loading={loading}
          onSelect={openUser}
          onParamsChange={setParams}
        />
      </section>
    </div>
  );
}

export default UserManagement;
