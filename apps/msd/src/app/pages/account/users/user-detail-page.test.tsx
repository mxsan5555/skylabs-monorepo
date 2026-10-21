import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserRecord } from '../../../../api/rbac/users';
import { SnackbarHost } from '../../../../snackbar/snackbar';
import { UserDetailPage } from './user-detail-page';

const getUserMock = vi.fn();
const getLoginHistoryMock = vi.fn();
const getSessionsMock = vi.fn();
const setUserRoleMock = vi.fn();
const loginAsUserMock = vi.fn().mockResolvedValue(undefined);

const useAuthMock = vi.fn();
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../../../api/rbac/users', () => ({
  getUser: (...args: unknown[]) => getUserMock(...args),
  updateUser: vi.fn().mockResolvedValue({ data: {} }),
  setUserStatus: vi.fn(),
  setUserRole: (...args: unknown[]) => setUserRoleMock(...args),
  revokeAllSessions: vi.fn(),
  resetOtp: vi.fn(),
  getLoginHistory: (...args: unknown[]) => getLoginHistoryMock(...args),
  getSessions: (...args: unknown[]) => getSessionsMock(...args),
}));

vi.mock('../../../../api/rbac/roles', () => ({
  listRoles: vi.fn().mockResolvedValue({
    data: [
      { id: 'role-1', key: 'admin', name: 'Admin', isSuperAdmin: false },
      { id: 'role-2', key: 'sales', name: 'Sales', isSuperAdmin: false },
    ],
  }),
  getPermissionCatalog: vi.fn().mockResolvedValue({ data: [] }),
  getRolePermissions: vi.fn().mockResolvedValue({ data: [] }),
}));

const SAMPLE_USER: UserRecord = {
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

const VIEWER_SELF_BOOTSTRAP = { user: { id: 'user-1' }, roles: [{ id: 'r1', key: 'admin', name: 'Admin', isSuperAdmin: false }] };
const VIEWER_OTHER_BOOTSTRAP = { user: { id: 'viewer-9' }, roles: [{ id: 'r1', key: 'admin', name: 'Admin', isSuperAdmin: false }] };
const VIEWER_SUPERADMIN_BOOTSTRAP = { user: { id: 'viewer-9' }, roles: [{ id: 'r2', key: 'super_admin', name: 'Super Admin', isSuperAdmin: true }] };

function renderPage(url = '/account/administration/users/user-1') {
  getUserMock.mockResolvedValue({ data: SAMPLE_USER });
  getLoginHistoryMock.mockResolvedValue({ data: [] });
  getSessionsMock.mockResolvedValue({ data: [] });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/administration/users/:userId" element={<UserDetailPage />} />
        <Route path="/account/administration/users/:userId/:section" element={<UserDetailPage />} />
        <Route path="/account/dashboard" element={<p>dashboard-stub</p>} />
      </Routes>
      <SnackbarHost />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  loginAsUserMock.mockResolvedValue(undefined);
  getLoginHistoryMock.mockResolvedValue({ data: [] });
  getSessionsMock.mockResolvedValue({ data: [] });
});

/** `md-filter-chip` isn't upgraded under jsdom, so its `label` is a set property/attribute, not
 *  rendered text — find the chip by that instead of `getByText` (same gotcha documented
 *  elsewhere for raw custom elements under Vitest + jsdom). */
function findChip(label: string): Element | undefined {
  return Array.from(document.querySelectorAll('md-filter-chip')).find(
    (el) => (el as unknown as { label?: string }).label === label,
  );
}

describe('UserDetailPage', () => {
  it('loads the user by the id in the URL and shows the name, status, and contact', async () => {
    useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: VIEWER_SUPERADMIN_BOOTSTRAP, loginAsUser: loginAsUserMock });
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeTruthy();
    expect(document.querySelector('sky-badge')?.textContent).toBe('Active');
    expect(getUserMock).toHaveBeenCalledWith('tok', 'user-1');
  });

  describe('login history visibility — own-scoped unless SuperAdmin', () => {
    it('hides login history/sessions when viewing ANOTHER user as a non-SuperAdmin (e.g. Admin)', async () => {
      useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: VIEWER_OTHER_BOOTSTRAP, loginAsUser: loginAsUserMock });
      renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
      expect(screen.queryByText('Login history', { selector: 'h2' })).toBeNull();
      expect(getLoginHistoryMock).not.toHaveBeenCalled();
    });

    it('shows login history/sessions when viewing OWN row', async () => {
      useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: VIEWER_SELF_BOOTSTRAP, loginAsUser: loginAsUserMock });
      renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
      await waitFor(() => expect(getLoginHistoryMock).toHaveBeenCalledWith('tok', 'user-1'));
    });

    it('shows login history/sessions for a genuine SuperAdmin viewing another user', async () => {
      useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: VIEWER_SUPERADMIN_BOOTSTRAP, loginAsUser: loginAsUserMock });
      renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
      await waitFor(() => expect(getLoginHistoryMock).toHaveBeenCalledWith('tok', 'user-1'));
    });
  });

  describe('"Login as" (impersonation) gating', () => {
    function findLoginAsButton(): HTMLElement | undefined {
      return Array.from(document.querySelectorAll('md-outlined-button')).find((el) => (el.textContent ?? '').includes('Login as')) as
        | HTMLElement
        | undefined;
    }

    it('shows "Login as" for a caller with rbac.users:custom', async () => {
      useAuthMock.mockReturnValue({
        token: 'tok',
        can: (menuKey: string, action?: string) => menuKey === 'rbac.users' && action === 'custom',
        bootstrap: VIEWER_SUPERADMIN_BOOTSTRAP,
        loginAsUser: loginAsUserMock,
      });
      renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
      expect(findLoginAsButton()).toBeTruthy();
    });

    it('hides "Login as" without rbac.users:custom', async () => {
      useAuthMock.mockReturnValue({ token: 'tok', can: () => false, bootstrap: VIEWER_OTHER_BOOTSTRAP, loginAsUser: loginAsUserMock });
      renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
      expect(findLoginAsButton()).toBeUndefined();
    });

    it('calls loginAsUser(id) and navigates to the dashboard when clicked', async () => {
      useAuthMock.mockReturnValue({
        token: 'tok',
        can: (menuKey: string, action?: string) => menuKey === 'rbac.users' && action === 'custom',
        bootstrap: VIEWER_SUPERADMIN_BOOTSTRAP,
        loginAsUser: loginAsUserMock,
      });
      renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
      fireEvent.click(findLoginAsButton()!);
      await waitFor(() => expect(loginAsUserMock).toHaveBeenCalledExactlyOnceWith('user-1'));
      expect(await screen.findByText('dashboard-stub')).toBeTruthy();
    });
  });

  describe('Roles & Access tab', () => {
    // NOTE: `OutlinedSelect` is a shared-ui React wrapper — like the other wrappers documented in
    // this repo's own testing conventions, it does not set element properties (`value`/`disabled`)
    // on the underlying custom element under this jsdom + `@lit/react` + React 19 combination, so
    // these tests assert rendered content/markup rather than wrapper-set properties.
    // `setUserRole`'s own call shape (atomic single-role replace) is covered by the backend's
    // `rbac.routes.test.ts` suite.
    it('navigates to the roles section via the ChipNav and renders the single-role dropdown + Save control', async () => {
      useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: VIEWER_SUPERADMIN_BOOTSTRAP, loginAsUser: loginAsUserMock });
      renderPage();
      await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });
      const chip = findChip('Roles & Access');
      expect(chip).toBeTruthy();
      fireEvent.click(chip!);
      expect(await screen.findByText('Assigned role')).toBeTruthy();
      expect(document.querySelector('md-outlined-select')).toBeTruthy();
      expect(Array.from(document.querySelectorAll('md-filled-button')).some((el) => (el.textContent ?? '').includes('Save role'))).toBe(true);
    });

    it('does not call setUserRole just from rendering the tab (no accidental auto-save)', async () => {
      useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: VIEWER_SUPERADMIN_BOOTSTRAP, loginAsUser: loginAsUserMock });
      renderPage('/account/administration/users/user-1/roles');
      await screen.findByText('Assigned role');
      expect(setUserRoleMock).not.toHaveBeenCalled();
    });
  });

  it('shows "User not found" for a load failure', async () => {
    useAuthMock.mockReturnValue({ token: 'tok', can: () => true, bootstrap: VIEWER_SUPERADMIN_BOOTSTRAP, loginAsUser: loginAsUserMock });
    getUserMock.mockRejectedValue(new Error('not found'));
    render(
      <MemoryRouter initialEntries={['/account/administration/users/missing']}>
        <Routes>
          <Route path="/account/administration/users/:userId" element={<UserDetailPage />} />
        </Routes>
        <SnackbarHost />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Could not load this user.')).toBeTruthy();
  });
});
