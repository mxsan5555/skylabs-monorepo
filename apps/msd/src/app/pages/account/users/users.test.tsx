import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navigateMock = vi.fn();
const loginAsUserMock = vi.fn().mockResolvedValue(undefined);

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
    loginAsUser: loginAsUserMock,
  }),
}));

const listUsersMock = vi.fn();
const getLoginHistoryMock = vi.fn();
const getSessionsMock = vi.fn();

vi.mock('../../../../api/rbac/users', () => ({
  listUsers: (...args: unknown[]) => listUsersMock(...args),
  updateUser: vi.fn(),
  setUserStatus: vi.fn(),
  assignRole: vi.fn(),
  unassignRole: vi.fn(),
  revokeAllSessions: vi.fn(),
  resetOtp: vi.fn(),
  getLoginHistory: (...args: unknown[]) => getLoginHistoryMock(...args),
  getSessions: (...args: unknown[]) => getSessionsMock(...args),
}));

vi.mock('../../../../api/rbac/roles', () => ({
  listRoles: vi.fn().mockResolvedValue({ data: [] }),
}));

import { UserManagement } from './users';

const sampleUser = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  status: 'active' as const,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  roles: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  loginAsUserMock.mockResolvedValue(undefined);
  getLoginHistoryMock.mockResolvedValue({ data: [] });
  getSessionsMock.mockResolvedValue({ data: [] });
});

async function selectSampleUser() {
  fireEvent.click(await screen.findByRole('button', { name: /Ada Lovelace/ }));
  // Login history / sessions panels resolve after selection.
  await waitFor(() => expect(getLoginHistoryMock).toHaveBeenCalled());
}

/**
 * "Login as" renders as `<md-outlined-button>` (a Material Web custom element) —
 * jsdom's accessibility tree doesn't understand its internals-assigned role, so
 * `getByRole('button', ...)` can't find it. Query the custom element directly instead.
 */
function findLoginAsButton(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('md-outlined-button')).find((el) =>
    (el.textContent ?? '').includes('Login as'),
  ) as HTMLElement | undefined;
}

describe('UserManagement — "Login as" (impersonation) gating', () => {
  it('shows the "Login as" action for a caller with rbac.users:custom', async () => {
    grantedPermissions = new Set(['rbac.users:custom']);
    listUsersMock.mockResolvedValue({ data: [sampleUser], meta: { total: 1 } });
    render(<UserManagement />);

    await selectSampleUser();

    expect(findLoginAsButton()).toBeTruthy();
  });

  it('hides the "Login as" action for a caller without rbac.users:custom', async () => {
    grantedPermissions = new Set(); // no rbac.users:custom
    listUsersMock.mockResolvedValue({ data: [sampleUser], meta: { total: 1 } });
    render(<UserManagement />);

    await selectSampleUser();

    expect(findLoginAsButton()).toBeUndefined();
  });

  it('calls loginAsUser(id) and navigates to the dashboard when "Login as" is clicked', async () => {
    grantedPermissions = new Set(['rbac.users:custom']);
    listUsersMock.mockResolvedValue({ data: [sampleUser], meta: { total: 1 } });
    render(<UserManagement />);

    await selectSampleUser();
    const loginAsButton = findLoginAsButton();
    expect(loginAsButton).toBeTruthy();
    fireEvent.click(loginAsButton!);

    await waitFor(() => expect(loginAsUserMock).toHaveBeenCalledExactlyOnceWith('user-1'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledExactlyOnceWith('/account/dashboard'));
  });
});

describe('UserManagement — list loading states', () => {
  // Edge case: empty state
  it('shows the empty-state message when no users are returned', async () => {
    grantedPermissions = new Set();
    listUsersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<UserManagement />);

    expect(await screen.findByText('No users match.')).toBeTruthy();
  });

  // Edge case: error/network failure state
  it('shows an error message when the users request fails', async () => {
    grantedPermissions = new Set();
    listUsersMock.mockRejectedValue(new Error('network down'));
    render(<UserManagement />);

    expect(await screen.findByText('Could not load users.')).toBeTruthy();
  });
});
