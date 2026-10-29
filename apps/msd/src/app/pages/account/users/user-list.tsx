import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import type { UserRecord } from '../../../../api/rbac/users';

interface UserTableParams {
  page: number;
  pageSize: number;
  search: string;
}

interface UserListProps {
  users: UserRecord[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onSelect: (id: string) => void;
  onParamsChange: (params: UserTableParams) => void;
}

const STATUS_MAP: Record<string, 'success' | 'warning' | 'error'> = {
  Active: 'success',
  Inactive: 'warning',
  Blocked: 'error',
};

/** A brand-new staff account created with only a phone/email has no name-collection step
 *  (`User.name` seeds from the raw identifier) — showing that verbatim in the "User" column
 *  would just repeat the adjacent "Contact" line, so this is the honest fallback instead of
 *  fabricating a display name from the mobile number. Mirrors `customerDisplayName`. */
export function userDisplayName(user: Pick<UserRecord, 'name' | 'phone' | 'email'>): string {
  if (!user.name) return 'Name not added';
  if (user.name === user.phone || user.name === user.email) return 'Name not added';
  return user.name;
}

const USER_COLUMNS = JSON.stringify([
  { key: 'User', label: 'User / Contact', secondaryKey: 'Contact Detail' },
  { key: 'Roles', label: 'Assigned Roles' },
  { key: 'Status', label: 'Account Status', type: 'status', statusMap: STATUS_MAP },
  { key: 'Last Login', label: 'Last Login' },
]);

const USER_VIEW_ACTION = { icon: 'chevron_right', label: 'View User', event: 'select' };

function statusLabel(status: UserRecord['status']): string {
  if (status === 'active') return 'Active';
  if (status === 'inactive') return 'Inactive';
  return 'Blocked';
}

function toUserRow(user: UserRecord): Record<string, string | number> {
  const contactBits = [user.phone, user.email].filter(Boolean);
  return {
    'User ID': user.id,
    User: userDisplayName(user),
    'Contact Detail': contactBits.join(' · ') || 'No contact on file',
    Roles: user.roles.map((r) => r.name).join(', ') || 'No role assigned',
    Status: statusLabel(user.status),
    // `lastLoginAt` is already stripped server-side (null) for any row the caller isn't
    // authorized to see the login activity of — "Not visible" here reflects that scoping
    // honestly rather than showing a misleading blank for a value that was never fetched.
    'Last Login': user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Not visible',
  };
}

/** Internal Staff directory table — same `sky-data-table` pattern as `customer-list.tsx` /
 *  `vendor-list.tsx`. Presenter-only: pagination/search state and the actual `listUsers` fetch
 *  stay owned by the parent (`users.tsx`). */
export function UserList({ users, total, page, pageSize, loading, onSelect, onParamsChange }: UserListProps) {
  const tableRef = useRef<HTMLElement>(null);
  const rows = useMemo(() => JSON.stringify(users.map(toUserRow)), [users]);
  const actions = useMemo(() => JSON.stringify([USER_VIEW_ACTION]), []);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParams = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      onParamsChange({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      const id = detail.row['User ID'];
      if (typeof id !== 'string' || !id) return;
      if (detail.action === 'select') onSelect(id);
    };

    el.addEventListener('sky-dt-params-change', onParams);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParams);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [onParamsChange, onSelect]);

  return (
    <sky-data-table
      ref={tableRef as RefObject<HTMLElement>}
      caption="Staff users"
      columns={USER_COLUMNS}
      rows={rows}
      total={total}
      page={page}
      page-size={pageSize}
      loading={loading}
      searchable
      search-placeholder="Search staff users…"
      actions={actions}
    />
  );
}

export default UserList;
