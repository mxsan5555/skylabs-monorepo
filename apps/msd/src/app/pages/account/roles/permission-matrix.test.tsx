import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PermissionCatalogRow, PermissionScope, Role } from '../../../../api/rbac/roles';
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
      { action: 'view', key: 'members:view', permissionId: 'perm-members-view', label: 'Members: view' },
      { action: 'create', key: 'members:create', permissionId: 'perm-members-create', label: 'Members: create' },
      { action: 'edit', key: 'members:edit', permissionId: null, label: null },
      { action: 'status_change', key: 'members:status_change', permissionId: 'perm-members-status', label: 'Members: status' },
    ],
  },
  {
    id: 'content',
    menuKey: 'content',
    title: 'Content',
    actions: [{ action: 'view', key: 'content:view', permissionId: 'perm-content-view', label: 'Content: view' }],
  },
];

const role = (key: string, name = 'Admin'): Role => ({ id: `role-${key}`, key, name }) as unknown as Role;

function renderMatrix(
  props: Partial<{ role: Role | null; permissions: ReadonlyMap<string, PermissionScope>; disabled: boolean }> = {},
) {
  const onPermissionToggle = vi.fn();
  render(
    <PermissionMatrix
      catalog={catalog}
      role={props.role === undefined ? role('admin') : props.role}
      permissions={props.permissions ?? new Map()}
      onPermissionToggle={onPermissionToggle}
      disabled={props.disabled}
    />,
  );
  return { onPermissionToggle };
}

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

/** P10-46: the matrix is one checkbox per V/C/E/D action per resource for the selected role. */
describe('PermissionMatrix', () => {
  it('asks for a role before showing the grid', () => {
    renderMatrix({ role: null });
    expect(screen.getByText('Select a role to view and manage its permissions.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists each resource as a row header with a checkbox per defined V/C/E/D action', () => {
    renderMatrix();
    expect(screen.getByRole('rowheader', { name: 'Members' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Content' })).toBeTruthy();
    expect(box('Admin: Members: View')).toBeTruthy();
    expect(box('Admin: Members: Create')).toBeTruthy();
    expect(box('Admin: Content: View')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Admin: Content: Delete' })).toBeNull();
  });

  it('shows no column for actions outside V/C/E/D, such as status_change', () => {
    renderMatrix();
    const labels = screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
    expect(labels.some((l) => /status/i.test(l ?? ''))).toBe(false);
  });

  it('checks the actions the role holds', () => {
    renderMatrix({ permissions: new Map([['perm-members-view', 'ALL']]) });
    expect(box('Admin: Members: View').checked).toBe(true);
    expect(box('Admin: Members: Create').checked).toBe(false);
  });

  it('reports a toggle with the role, permission, new state and scope', () => {
    const { onPermissionToggle } = renderMatrix();
    fireEvent.click(box('Admin: Members: Create'));
    expect(onPermissionToggle).toHaveBeenCalledWith('role-admin', 'perm-members-create', true, 'ALL');
  });

  it('grants member resources with own scope to the member role', () => {
    const { onPermissionToggle } = renderMatrix({ role: role('member', 'Member') });
    fireEvent.click(box('Member: Members: View'));
    expect(onPermissionToggle).toHaveBeenCalledWith('role-member', 'perm-members-view', true, 'OWN');
  });

  it('disables an action whose permission row is missing', () => {
    renderMatrix();
    expect(box('Admin: Members: Edit').disabled).toBe(true);
  });

  it('disables every checkbox when disabled', () => {
    renderMatrix({ disabled: true });
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true);
  });
});
