import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const getMyProfileMock = vi.fn();
const updateMyProfileMock = vi.fn();

vi.mock('../../../../api/rbac/me', () => ({
  getMyProfile: (...args: unknown[]) => getMyProfileMock(...args),
  updateMyProfile: (...args: unknown[]) => updateMyProfileMock(...args),
}));

import { MyProfileSettings } from './settings';

const superAdminUser = {
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '9876543210',
  status: 'active' as const,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  roles: [{ id: 'role-1', key: 'super_admin', name: 'Super Admin' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// `label` and `disabled` aren't reliably reflected as real DOM attributes/properties for
// `@lit/react`-wrapped Material text fields under jsdom (same documented gap noted elsewhere in
// this codebase, e.g. `vendor-profile-form.test.tsx`), so fields are identified by their fixed
// render order (Name, Email, Phone, Role — see settings.tsx's own JSX) rather than by a label
// query, and the Role field's read-only-ness is verified by direct code review of settings.tsx's
// unconditional `<OutlinedTextField label="Role" ... disabled />` (a literal, not a computed
// value — there is no code path that could ever make it editable) rather than a DOM assertion.
function fields(): HTMLElement[] {
  return Array.from(document.querySelectorAll('md-outlined-text-field'));
}

/**
 * Feature: Superadmin (and every other authenticated user's) own profile page (Vendor
 * Validation/Permissions audit, Phase 7). Role is always shown read-only — there is no editable
 * Role control on this page at all, and the underlying `PATCH /rbac/users/me` schema has no
 * role field either, so this holds regardless of what a caller might try to submit.
 *
 * NOTE: like `vendor-branches.test.tsx`/`categories.test.tsx`'s own documented limitation,
 * `@lit/react`-wrapped Material text fields don't reflect their live value in a way
 * `getByDisplayValue` can see under jsdom — this suite verifies the loaded/rendered state (field
 * presence, submitted payload shape) rather than simulating live typing.
 */
describe('MyProfileSettings', () => {
  it('loads the caller\'s own profile and renders Name/Email/Phone/Role fields', async () => {
    getMyProfileMock.mockResolvedValue({ data: superAdminUser });
    render(<MyProfileSettings />);

    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalledWith('test-token'));
    await waitFor(() => expect(fields().length).toBe(4));
  });

  it('saving submits only name/email/phone — never a role/roleIds field', async () => {
    getMyProfileMock.mockResolvedValue({ data: superAdminUser });
    updateMyProfileMock.mockResolvedValue({ data: superAdminUser });
    render(<MyProfileSettings />);

    await waitFor(() => expect(fields().length).toBe(4));
    const saveButton = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save changes'));
    expect(saveButton).toBeTruthy();
    fireEvent.click(saveButton!);

    await waitFor(() => expect(updateMyProfileMock).toHaveBeenCalled());
    const [calledToken, submitted] = updateMyProfileMock.mock.calls[0];
    expect(calledToken).toBe('test-token');
    expect(submitted).not.toHaveProperty('role');
    expect(submitted).not.toHaveProperty('roleIds');
    expect(await screen.findByText('Profile saved.')).toBeTruthy();
  });

  it('shows an error message and never crashes when loading the profile fails', async () => {
    getMyProfileMock.mockRejectedValue(new Error('network down'));
    render(<MyProfileSettings />);

    expect(await screen.findByText('Could not load your profile.')).toBeTruthy();
  });
});
