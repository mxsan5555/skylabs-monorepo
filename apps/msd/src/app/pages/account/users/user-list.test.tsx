import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { UserRecord } from '../../../../api/rbac/users';
import { UserList } from './user-list';

const users: UserRecord[] = [
  {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: null,
    status: 'active',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    roles: [],
  },
  {
    id: 'user-2',
    name: 'Grace Hopper',
    email: null,
    phone: '+911234567890',
    status: 'blocked',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    roles: [],
  },
];

describe('UserList', () => {
  it('renders a row per user with name and email/phone', () => {
    render(<UserList users={users} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(screen.getByText('+911234567890')).toBeTruthy();
  });

  it('renders the status pill text for each user', () => {
    render(<UserList users={users} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('blocked')).toBeTruthy();
  });

  it('marks the selected row with aria-current', () => {
    render(<UserList users={users} selectedId="user-2" onSelect={vi.fn()} />);
    const button = screen.getByRole('button', { name: /Grace Hopper/ });
    expect(button.getAttribute('aria-current')).toBe('true');
    const otherButton = screen.getByRole('button', { name: /Ada Lovelace/ });
    expect(otherButton.getAttribute('aria-current')).toBeNull();
  });

  it('calls onSelect with the clicked user id', () => {
    const onSelect = vi.fn();
    render(<UserList users={users} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('user-1');
  });

  // Edge cases
  it('shows an empty-state message when there are no users', () => {
    render(<UserList users={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('No users match.')).toBeTruthy();
  });

  it('renders exactly one row per user (no duplication/omission) for a larger list', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...users[0], id: `user-${i}`, name: `User ${i}` }));
    render(<UserList users={many} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});
