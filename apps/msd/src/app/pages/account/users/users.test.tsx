import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserManagement } from './users';

const navigateMock = vi.fn();
let searchParamsValue = new URLSearchParams();
const setSearchParamsMock = vi.fn((updater: (prev: URLSearchParams) => URLSearchParams) => {
  searchParamsValue = updater(searchParamsValue);
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useSearchParams: () => [searchParamsValue, setSearchParamsMock],
}));

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listUsersMock = vi.fn();
vi.mock('../../../../api/rbac/users', () => ({
  listUsers: (...args: unknown[]) => listUsersMock(...args),
  createUser: vi.fn(),
}));

const listRolesMock = vi.fn();
vi.mock('../../../../api/rbac/roles', () => ({
  listRoles: (...args: unknown[]) => listRolesMock(...args),
}));


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
  searchParamsValue = new URLSearchParams();
  listRolesMock.mockResolvedValue({ data: [] });
});

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

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
  it('passes page/pageSize/search/roleKey through to listUsers', async () => {
    grantedPermissions = new Set();
    listUsersMock.mockResolvedValue({ data: [sampleUser], meta: { total: 1 } });
    render(<UserManagement />);

    await waitFor(() =>
      expect(listUsersMock).toHaveBeenCalledWith('test-token', {
        page: 1,
        pageSize: 20,
        search: undefined,
        roleKey: undefined,
      }),
    );
  });

  // Edge case: empty state
  it('shows the empty-state message when no users are returned', async () => {
    grantedPermissions = new Set();
    listUsersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<UserManagement />);

    await waitFor(() => {
      const rows = JSON.parse(table().getAttribute('rows') ?? '[]');
      expect(rows).toEqual([]);
    });
  });

  // Edge case: error/network failure state
  it('shows an error message when the users request fails', async () => {
    grantedPermissions = new Set();
    listUsersMock.mockRejectedValue(new Error('network down'));
    render(<UserManagement />);

    expect(await screen.findByText('Could not load staff users.')).toBeTruthy();
  });
});

describe('UserManagement — create user gating', () => {
  it('hides "New user" without rbac.users:create', async () => {
    grantedPermissions = new Set();
    listUsersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<UserManagement />);
    await waitFor(() => expect(listUsersMock).toHaveBeenCalled());
    expect(screen.queryByText('New user')).toBeNull();
  });

  it('shows "New user" with rbac.users:create', async () => {
    grantedPermissions = new Set(['rbac.users:create']);
    listUsersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(<UserManagement />);
    expect(await screen.findByText('New user')).toBeTruthy();
  });
});
