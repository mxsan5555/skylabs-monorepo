import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PermissionCatalogRow } from '../../../../api/rbac/roles';
import { PermissionMatrix } from './permission-matrix';

const catalog: PermissionCatalogRow[] = [
  {
    id: 'admin-roles',
    menuKey: 'rbac.roles',
    title: 'Role Management',
    actions: [
      { action: 'view', key: 'rbac.roles:view', permissionId: 'perm-view-1', label: 'View' },
      { action: 'create', key: 'rbac.roles:create', permissionId: 'perm-create-1', label: 'Create' },
      { action: 'edit', key: 'rbac.roles:edit', permissionId: 'perm-edit-1', label: 'Edit' },
      { action: 'delete', key: 'rbac.roles:delete', permissionId: null, label: null },
      { action: 'status_change', key: 'rbac.roles:status_change', permissionId: 'perm-status-1', label: 'Status change' },
    ],
  },
  {
    id: 'admin-users',
    menuKey: 'rbac.users',
    title: 'User Management',
    actions: [
      { action: 'view', key: 'rbac.users:view', permissionId: 'perm-view-2', label: 'View' },
      { action: 'create', key: 'rbac.users:create', permissionId: null, label: null },
      { action: 'edit', key: 'rbac.users:edit', permissionId: null, label: null },
      { action: 'delete', key: 'rbac.users:delete', permissionId: null, label: null },
      { action: 'export', key: 'rbac.users:export', permissionId: 'perm-export-2', label: 'Export' },
    ],
  },
];

describe('PermissionMatrix', () => {
  it('renders the catalog as a menu x action grid with row/column headers', () => {
    render(<PermissionMatrix catalog={catalog} selectedPermissionIds={new Set()} onToggle={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: 'view' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'edit' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Role Management' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'User Management' })).toBeTruthy();
  });

  it('renders a checked checkbox for a granted (selected) permission cell', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissionIds={new Set(['perm-view-1'])}
        onToggle={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Role Management — view' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('renders an unchecked checkbox for a cell not in selectedPermissionIds', () => {
    render(<PermissionMatrix catalog={catalog} selectedPermissionIds={new Set()} onToggle={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Role Management — edit' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('calls onToggle with the cell permissionId when its checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(<PermissionMatrix catalog={catalog} selectedPermissionIds={new Set()} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'User Management — view' }));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('perm-view-2');
  });

  it('disables every checkbox when disabled=true', () => {
    render(
      <PermissionMatrix catalog={catalog} selectedPermissionIds={new Set()} onToggle={vi.fn()} disabled />,
    );
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect((checkbox as HTMLInputElement).disabled).toBe(true);
    }
  });

  // Edge cases
  it('renders a dash instead of a checkbox for a cell with no permissionId (nothing grantable yet)', () => {
    render(<PermissionMatrix catalog={catalog} selectedPermissionIds={new Set()} onToggle={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'Role Management — delete' })).toBeNull();
  });

  it('shows an empty-state message when the catalog is empty', () => {
    render(<PermissionMatrix catalog={[]} selectedPermissionIds={new Set()} onToggle={vi.fn()} />);
    expect(screen.getByText('The permission catalog is empty.')).toBeTruthy();
  });

  // Regression for the reported bug: a navigation-only row (e.g. "Dashboard", a group header
  // with no create/edit/delete business operation) used to only have a seeded `view` Permission
  // row, so Create/Edit/Delete rendered as "—" for every role. seed.ts now seeds all 4 baseline
  // actions for every menuKey (see actionsForMenuKey), so the catalog always carries a real
  // permissionId for all 4 — this locks in that once seeded, the UI renders real (unchecked)
  // checkboxes, never a dash, for a navigation-only row.
  it('renders real unchecked checkboxes (not dashes) for all 4 actions on a navigation-only row once seeded', () => {
    const navOnlyCatalog: PermissionCatalogRow[] = [
      {
        id: 'dashboard',
        menuKey: 'dashboard',
        title: 'Dashboard',
        actions: [
          { action: 'view', key: 'dashboard:view', permissionId: 'perm-dash-view', label: 'View' },
          { action: 'create', key: 'dashboard:create', permissionId: 'perm-dash-create', label: 'Create' },
          { action: 'edit', key: 'dashboard:edit', permissionId: 'perm-dash-edit', label: 'Edit' },
          { action: 'delete', key: 'dashboard:delete', permissionId: 'perm-dash-delete', label: 'Delete' },
        ],
      },
    ];
    render(<PermissionMatrix catalog={navOnlyCatalog} selectedPermissionIds={new Set()} onToggle={vi.fn()} />);
    for (const action of ['view', 'create', 'edit', 'delete']) {
      const checkbox = screen.getByRole('checkbox', { name: `Dashboard — ${action}` }) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    }
  });

  // Regression: two catalog rows can legitimately share a `menuKey` (e.g. CMS "Pages"/"Articles"
  // both grant `cms.blog` by design), but each still comes from a distinct menu node with its
  // own `id`. Before rows were keyed on `row.id` (previously `row.menuKey`), two such rows
  // collided as React list keys — caught via a live "two children with the same key" console
  // error during manual verification — and one silently failed to render.
  it('renders two distinct rows even when they share a menuKey, keyed by the unique row id', () => {
    const sharedKeyCatalog: PermissionCatalogRow[] = [
      {
        id: 'cms-blog-pages',
        menuKey: 'cms.blog',
        title: 'Pages',
        actions: [
          { action: 'view', key: 'cms.blog:view', permissionId: 'perm-blog-view', label: 'View' },
          { action: 'create', key: 'cms.blog:create', permissionId: 'perm-blog-create', label: 'Create' },
          { action: 'edit', key: 'cms.blog:edit', permissionId: 'perm-blog-edit', label: 'Edit' },
          { action: 'delete', key: 'cms.blog:delete', permissionId: 'perm-blog-delete', label: 'Delete' },
        ],
      },
      {
        id: 'cms-blog-articles',
        menuKey: 'cms.blog',
        title: 'Articles',
        actions: [
          { action: 'view', key: 'cms.blog:view', permissionId: 'perm-blog-view', label: 'View' },
          { action: 'create', key: 'cms.blog:create', permissionId: 'perm-blog-create', label: 'Create' },
          { action: 'edit', key: 'cms.blog:edit', permissionId: 'perm-blog-edit', label: 'Edit' },
          { action: 'delete', key: 'cms.blog:delete', permissionId: 'perm-blog-delete', label: 'Delete' },
        ],
      },
    ];
    render(<PermissionMatrix catalog={sharedKeyCatalog} selectedPermissionIds={new Set()} onToggle={vi.fn()} />);
    expect(screen.getByRole('rowheader', { name: 'Pages' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Articles' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header row + Pages + Articles
  });

  it('renders only the View/Create/Edit/Delete columns, even when the catalog includes legacy actions', () => {
    render(<PermissionMatrix catalog={catalog} selectedPermissionIds={new Set()} onToggle={vi.fn()} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Menu', 'view', 'create', 'edit', 'delete']);
    expect(screen.queryByRole('columnheader', { name: 'status_change' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'export' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Role Management — status_change' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'User Management — export' })).toBeNull();
  });
});
