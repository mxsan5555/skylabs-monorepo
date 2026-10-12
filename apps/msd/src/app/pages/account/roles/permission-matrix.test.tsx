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
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissions={new Map()}
        onScopeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'view' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'edit' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Role Management' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'User Management' })).toBeTruthy();
  });

  it('keeps the selected scope for a granted permission', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissions={new Map([['perm-view-1', 'ALL']])}
        onScopeChange={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Role Management — view' }) as HTMLSelectElement;
    expect(select.value).toBe('ALL');
  });

  it('renders an empty option for a cell with no saved scope', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissions={new Map()}
        onScopeChange={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Role Management — edit' }) as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('calls onScopeChange with the selected permissionId and scope when a value changes', () => {
    const onScopeChange = vi.fn();
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissions={new Map()}
        onScopeChange={onScopeChange}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'User Management — view' }), {
      target: { value: 'ALL' },
    });
    expect(onScopeChange).toHaveBeenCalledExactlyOnceWith('perm-view-2', 'ALL');
  });

  it('disables every control when disabled=true', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissions={new Map()}
        onScopeChange={vi.fn()}
        disabled
      />,
    );
    for (const control of screen.getAllByRole('combobox')) {
      expect((control as HTMLSelectElement).disabled).toBe(true);
    }
  });

  it('renders a dash instead of a select for a cell with no permissionId', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissions={new Map()}
        onScopeChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Role Management — delete' })).toBeNull();
  });

  it('shows an empty-state message when the catalog is empty', () => {
    render(<PermissionMatrix catalog={[]} selectedPermissions={new Map()} onScopeChange={vi.fn()} />);
    expect(screen.getByText('The permission catalog is empty.')).toBeTruthy();
  });

  it('renders real unchecked selects (not dashes) for all 4 actions on a navigation-only row once seeded', () => {
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
    render(
      <PermissionMatrix
        catalog={navOnlyCatalog}
        selectedPermissions={new Map()}
        onScopeChange={vi.fn()}
      />,
    );
    for (const action of ['view', 'create', 'edit', 'delete']) {
      const select = screen.getByRole('combobox', { name: `Dashboard — ${action}` }) as HTMLSelectElement;
      expect(select.value).toBe('');
    }
  });

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
    render(
      <PermissionMatrix
        catalog={sharedKeyCatalog}
        selectedPermissions={new Map()}
        onScopeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('rowheader', { name: 'Pages' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Articles' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('renders only the View/Create/Edit/Delete columns, even when the catalog includes legacy actions', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        selectedPermissions={new Map()}
        onScopeChange={vi.fn()}
      />,
    );
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Menu', 'view', 'create', 'edit', 'delete']);
    expect(screen.queryByRole('columnheader', { name: 'status_change' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'export' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Role Management — status_change' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'User Management — export' })).toBeNull();
  });
});
