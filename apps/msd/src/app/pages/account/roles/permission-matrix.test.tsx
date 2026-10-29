import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PermissionCatalogRow, Role } from '../../../../api/rbac/roles';
import { PermissionMatrix } from './permission-matrix';

const ROLE: Role = {
  id: 'role-admin',
  key: 'admin',
  name: 'Admin',
  description: 'Admin role',
  isSystem: true,
  isSuperAdmin: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const catalog: PermissionCatalogRow[] = [
  {
    id: 'members',
    menuKey: 'members',
    title: 'Members',
    actions: [
      { action: 'view', key: 'members:view', permissionIds: ['perm-members-view'], label: 'View' },
      { action: 'create', key: 'members:create', permissionIds: ['perm-members-create'], label: 'Create' },
      { action: 'edit', key: 'members:edit', permissionIds: ['perm-members-edit'], label: 'Edit' },
      { action: 'delete', key: 'members:delete', permissionIds: [], label: null },
    ],
  },
  {
    id: 'audit-logs',
    menuKey: 'rbac.audit-logs',
    title: 'Logs',
    actions: [
      { action: 'view', key: 'rbac.audit-logs:view', permissionIds: ['perm-logs-view'], label: 'View' },
    ],
  },
  // Mirrors `content`'s real shape — one UI action backed by several real Permission ids
  // (msd-api aggregates the ~10 real `cms.*` keys this way) that must move atomically.
  {
    id: 'content',
    menuKey: 'cms, cms.blog.pages',
    title: 'Content',
    actions: [
      { action: 'view', key: 'cms:view, cms.blog.pages:view', permissionIds: ['perm-cms-view', 'perm-blog-view'], label: 'View' },
    ],
  },
];

describe('PermissionMatrix', () => {
  it('shows a prompt instead of a table when no role is selected', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        // eslint-disable-next-line jsx-a11y/aria-role -- `role` here is PermissionMatrix's own
        // `Role | null` prop, not the DOM `role` attribute; the plugin can't tell custom
        // component props from native ones apart by name alone.
        role={null}
        permissions={new Map()}
        onPermissionToggle={vi.fn()}
      />,
    );
    expect(screen.getByText('Select a role to view and manage its permissions.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders one resource per row and one column per action plus Scope, using the shared data-table classes', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map()}
        onPermissionToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole('rowheader', { name: 'Members' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Logs' })).toBeTruthy();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Resource', 'View', 'Create', 'Edit', 'Delete', 'Scope']);
    expect(document.querySelector('.perm-matrix-wrap table.perm-matrix')).toBeTruthy();
  });

  it('shows a dash, not a disabled checkbox, for an action the resource does not define', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map()}
        onPermissionToggle={vi.fn()}
      />,
    );
    expect(screen.queryByRole('checkbox', { name: 'Admin: Logs: Create' })).toBeNull();
  });

  it('disables the checkbox when the backend has not created the permission record yet', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map()}
        onPermissionToggle={vi.fn()}
      />,
    );
    expect((screen.getByRole('checkbox', { name: 'Admin: Members: Delete' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('checks a box when the permission is in the granted set, unchecked otherwise', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map([['perm-members-view', 'ALL']])}
        onPermissionToggle={vi.fn()}
      />,
    );
    expect((screen.getByRole('checkbox', { name: 'Admin: Members: View' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Admin: Members: Create' }) as HTMLInputElement).checked).toBe(false);
  });

  it('calls onPermissionToggle with the role, permissionId and the checked state', () => {
    const onPermissionToggle = vi.fn();
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map()}
        onPermissionToggle={onPermissionToggle}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Admin: Members: Create' }));
    expect(onPermissionToggle).toHaveBeenCalledWith(ROLE.id, 'perm-members-create', true, 'ALL');
  });

  it('a resource backed by several real keys (Content) is checked only when every one of them is granted', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map([['perm-cms-view', 'ALL']])}
        onPermissionToggle={vi.fn()}
      />,
    );
    // Only one of the two real keys behind Content: View is granted — still unchecked.
    expect((screen.getByRole('checkbox', { name: 'Admin: Content: View' }) as HTMLInputElement).checked).toBe(false);
  });

  it('toggling a resource backed by several real keys (Content) grants/revokes every one of them at once', () => {
    const onPermissionToggle = vi.fn();
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map()}
        onPermissionToggle={onPermissionToggle}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Admin: Content: View' }));
    expect(onPermissionToggle).toHaveBeenCalledWith(ROLE.id, 'perm-cms-view', true, 'ALL');
    expect(onPermissionToggle).toHaveBeenCalledWith(ROLE.id, 'perm-blog-view', true, 'ALL');
    expect(onPermissionToggle).toHaveBeenCalledTimes(2);
  });

  it('disables every checkbox and select when disabled=true', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map([['perm-logs-view', 'OWN']])}
        onPermissionToggle={vi.fn()}
        disabled
      />,
    );
    for (const box of screen.getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
    expect((screen.getByRole('combobox', { name: 'Admin: Logs: scope' }) as HTMLSelectElement).disabled).toBe(true);
  });

  it('shows a fixed "All" label for a resource outside the OWN-scope allowlist, never an editable select', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map([['perm-members-view', 'ALL']])}
        onPermissionToggle={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Admin: Members: scope' })).toBeNull();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
  });

  it('offers an editable Own/All select for a resource on the OWN-scope allowlist (rbac.audit-logs:view)', () => {
    const onPermissionToggle = vi.fn();
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map([['perm-logs-view', 'ALL']])}
        onPermissionToggle={onPermissionToggle}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Admin: Logs: scope' }) as HTMLSelectElement;
    expect(select.value).toBe('ALL');
    fireEvent.change(select, { target: { value: 'OWN' } });
    expect(onPermissionToggle).toHaveBeenCalledWith(ROLE.id, 'perm-logs-view', true, 'OWN');
  });

  it('marks a checkbox that differs from the last-saved grant set as an unsaved change', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={new Map([['perm-members-view', 'ALL']])}
        savedPermissions={new Map()}
        onPermissionToggle={vi.fn()}
      />,
    );
    const cell = screen.getByRole('checkbox', { name: 'Admin: Members: View' }).closest('td');
    expect(cell?.className).toContain('perm-matrix__cell--dirty');
  });

  it('does not mark anything dirty when the draft matches the last-saved grant set', () => {
    const saved = new Map([['perm-members-view', 'ALL' as const]]);
    render(
      <PermissionMatrix
        catalog={catalog}
        role={ROLE}
        permissions={saved}
        savedPermissions={saved}
        onPermissionToggle={vi.fn()}
      />,
    );
    const cell = screen.getByRole('checkbox', { name: 'Admin: Members: View' }).closest('td');
    expect(cell?.className).toBeFalsy();
  });
});
