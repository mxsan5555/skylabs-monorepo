import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PermissionCatalogRow } from '../../../../api/rbac/roles';
import { PermissionMatrix } from './permission-matrix';

const catalog: PermissionCatalogRow[] = [
  {
    menuKey: 'rbac.roles',
    title: 'Role Management',
    actions: [
      { action: 'view', key: 'rbac.roles:view', permissionId: 'perm-view-1', label: 'View' },
      { action: 'edit', key: 'rbac.roles:edit', permissionId: 'perm-edit-1', label: 'Edit' },
      { action: 'delete', key: 'rbac.roles:delete', permissionId: null, label: null },
    ],
  },
  {
    menuKey: 'rbac.users',
    title: 'User Management',
    actions: [
      { action: 'view', key: 'rbac.users:view', permissionId: 'perm-view-2', label: 'View' },
      { action: 'edit', key: 'rbac.users:edit', permissionId: null, label: null },
      { action: 'delete', key: 'rbac.users:delete', permissionId: null, label: null },
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
});
