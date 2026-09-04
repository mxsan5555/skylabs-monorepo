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

const listRolesMock = vi.fn();
vi.mock('../../../../api/rbac/roles', () => ({
  listRoles: (...args: unknown[]) => listRolesMock(...args),
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
  listRolesMock.mockResolvedValue({ data: [] });
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

/**
 * Feature: User Management role filter (Vendor Validation/Permissions audit, Phase 6)
 * Scenario: the role filter dropdown is driven off the real seeded role list (`GET /rbac/roles`),
 * never a hardcoded array, and never offers the Superadmin role as an option — filtering by it
 * would always return zero rows since Superadmin users are excluded server-side
 * (`user.service.ts#listUsers`'s own doc comment).
 *
 * NOTE: like `vendor-branches.test.tsx`/`categories.test.tsx`'s own documented limitation, a live
 * select interaction can't be simulated under this jsdom + `@lit/react` + React 19 combination —
 * verified via the rendered option labels (an already-resolved, real DOM query) rather than
 * driving a live pick; `listUsers`'s `roleKey` plumbing itself is covered by the backend's own
 * `user.service.test.ts`/`rbac.routes.test.ts` suites.
 */
describe('UserManagement — role filter', () => {
  const VENDOR_ROLE = { id: 'role-vendor', key: 'vendor', name: 'Vendor', isSuperAdmin: false };
  const CUSTOMER_ROLE = { id: 'role-customer', key: 'customer', name: 'Customer', isSuperAdmin: false };
  const SUPERADMIN_ROLE = { id: 'role-superadmin', key: 'super_admin', name: 'Super Admin', isSuperAdmin: true };

  it('lists every real seeded role as a filter option except Superadmin, plus "All"', async () => {
    grantedPermissions = new Set();
    listRolesMock.mockResolvedValue({ data: [VENDOR_ROLE, CUSTOMER_ROLE, SUPERADMIN_ROLE] });
    listUsersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<UserManagement />);

    await waitFor(() => expect(listRolesMock).toHaveBeenCalled());
    const optionLabels = await waitFor(() => {
      const select = document.querySelector('md-outlined-select');
      if (!select) throw new Error('Role select not found');
      const labels = Array.from(select.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
      if (labels.length === 0) throw new Error('Role options not rendered yet');
      return labels;
    });
    expect(optionLabels).toEqual(['All', 'Vendor', 'Customer']);
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
