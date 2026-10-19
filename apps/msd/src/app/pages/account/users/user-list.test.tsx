import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { UserRecord } from '../../../../api/rbac/users';
import { UserList, userDisplayName } from './user-list';

const ACTIVE_USER: UserRecord = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  status: 'active',
  lastLoginAt: '2026-05-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  roles: [{ id: 'role-1', key: 'admin', name: 'Admin' }],
};

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function renderList(overrides: Partial<React.ComponentProps<typeof UserList>> = {}) {
  return render(
    <UserList
      users={[ACTIVE_USER]}
      total={1}
      page={1}
      pageSize={20}
      loading={false}
      onSelect={vi.fn()}
      onParamsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe('UserList', () => {
  it('renders the "User / Contact" composite cell, Roles, Status, and Last Login columns', () => {
    renderList();
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(rows[0].User).toBe('Ada Lovelace');
    expect(rows[0]['Contact Detail']).toBe('ada@example.com');
    expect(rows[0].Roles).toBe('Admin');
    expect(rows[0].Status).toBe('Active');
    expect(rows[0]['Last Login']).not.toBe('Not visible');
  });

  it('renders "Not visible" for Last Login when the server stripped lastLoginAt (null)', () => {
    renderList({ users: [{ ...ACTIVE_USER, lastLoginAt: null }] });
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(rows[0]['Last Login']).toBe('Not visible');
  });

  it('renders "No role assigned" when a user has no roles', () => {
    renderList({ users: [{ ...ACTIVE_USER, roles: [] }] });
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(rows[0].Roles).toBe('No role assigned');
  });

  it('userDisplayName falls back to "Name not added" when name duplicates phone or email, or is empty', () => {
    expect(userDisplayName({ name: '+919876543210', phone: '+919876543210', email: null })).toBe('Name not added');
    expect(userDisplayName({ name: 'ada@example.com', phone: null, email: 'ada@example.com' })).toBe('Name not added');
    expect(userDisplayName({ name: '', phone: null, email: null })).toBe('Name not added');
    expect(userDisplayName({ name: 'Ada Lovelace', phone: null, email: 'ada@example.com' })).toBe('Ada Lovelace');
  });

  it('only ever shows the "View User" action', () => {
    renderList();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['select']);
  });

  it('clicking "select" resolves the row id via onSelect', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });
    fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action: 'select', row: { 'User ID': 'user-1' } } }));
    expect(onSelect).toHaveBeenCalledWith('user-1');
  });

  it('forwards sky-dt-params-change (page/pageSize/search) to onParamsChange', () => {
    const onParamsChange = vi.fn();
    renderList({ onParamsChange });
    fireEvent(table(), new CustomEvent('sky-dt-params-change', { detail: { page: 2, pageSize: 20, search: 'ada' } }));
    expect(onParamsChange).toHaveBeenCalledWith({ page: 2, pageSize: 20, search: 'ada' });
  });

  it('renders exactly one row per user (no duplication/omission) for a larger list', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...ACTIVE_USER, id: `user-${i}`, name: `User ${i}` }));
    renderList({ users: many, total: 5 });
    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as Record<string, string>[];
    expect(rows).toHaveLength(5);
  });
});
