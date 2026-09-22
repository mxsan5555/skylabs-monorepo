import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../../api/rbac/client';

const getVendorOwnerAvailabilityMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    getVendorOwnerAvailability: (...args: unknown[]) => getVendorOwnerAvailabilityMock(...args),
  };
});

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { VendorUserPicker } from './vendor-user-picker';

beforeEach(() => {
  vi.clearAllMocks();
  getVendorOwnerAvailabilityMock.mockResolvedValue({ data: { available: true, conflicts: [] } });
});

/**
 * Feature: VendorUserPicker — brand-new owner identity form (no existing-user reuse)
 * Scenario: a single, always-new-owner form — name/email/mobile only. A debounced availability
 * check (`GET /vendors/users/lookup`) shows a blocking "already exists" message when the typed
 * email/mobile is already taken; there is no confirmation dialog, no "use existing account"
 * option, and no search-for-existing-user tab — a Vendor's owner is always a brand-new User.
 *
 * Given: an admin filling in "Add Vendor" Step 1
 * When: VendorUserPicker renders / the typed email or mobile is checked for availability
 * Then: available identities report the payload up; a taken identifier blocks reporting up and
 *       shows a clear error instead
 *
 * NOTE: driving the text fields via simulated typing (`fireEvent.input` on the
 * `createComponent`-wrapped `OutlinedTextField`) is not possible under this repo's documented
 * jsdom + `@lit/react` gap (see `vendor-branches.test.tsx`'s own doc comment — onInput/onChange
 * bindings never actually fire, and `label`/other properties never reflect either). This suite
 * instead mounts with a pre-filled `value` prop (the same technique `BranchDialog`'s Map Location
 * tests use for its pre-filled `branch` prop) to exercise the debounced-availability logic
 * without needing to type.
 */
describe('VendorUserPicker', () => {
  it('renders exactly 4 identity fields (First name, Last name, Email, Mobile), no tabs, no existing-user UI', () => {
    render(<VendorUserPicker value={null} onChange={vi.fn()} />);
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(4);
    expect(screen.queryByText('Enter new details')).toBeNull();
    expect(screen.queryByText('Search existing user')).toBeNull();
    expect(screen.queryByText('Use Existing Account')).toBeNull();
    expect(screen.queryByText('Vendor Account')).toBeNull();
  });

  it('with neither email nor mobile given, reports null and never calls the availability check', async () => {
    const onChange = vi.fn();
    render(<VendorUserPicker value={null} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(getVendorOwnerAvailabilityMock).not.toHaveBeenCalled();
  });

  it('an available identity reports the payload up once the debounced check resolves', async () => {
    getVendorOwnerAvailabilityMock.mockResolvedValue({ data: { available: true, conflicts: [] } });
    const onChange = vi.fn();
    render(
      <VendorUserPicker
        value={{ ownerFirstName: 'New', ownerEmail: 'brand-new@example.com', ownerMobile: '9111111111' }}
        onChange={onChange}
      />,
    );

    await waitFor(() =>
      expect(getVendorOwnerAvailabilityMock).toHaveBeenCalledWith('test-token', {
        email: 'brand-new@example.com',
        mobile: '9111111111',
      }),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        ownerFirstName: 'New',
        ownerLastName: undefined,
        ownerEmail: 'brand-new@example.com',
        ownerMobile: '9111111111',
      }),
    );
  });

  it('an email conflict blocks reporting up and shows a clear "already exists" message', async () => {
    getVendorOwnerAvailabilityMock.mockResolvedValue({ data: { available: false, conflicts: ['email'] } });
    const onChange = vi.fn();
    render(<VendorUserPicker value={{ ownerEmail: 'taken@example.com' }} onChange={onChange} />);

    await waitFor(() => expect(screen.getByText(/A user with this email already exists/)).toBeTruthy());
    // The identity may be optimistically reported up while the check is still in flight, but the
    // LAST call, once the conflict is known, must retract to null — never leave the taken
    // identity as the most recent reported value.
    expect(onChange.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('a phone conflict blocks reporting up and shows a clear "already exists" message', async () => {
    getVendorOwnerAvailabilityMock.mockResolvedValue({ data: { available: false, conflicts: ['phone'] } });
    const onChange = vi.fn();
    render(<VendorUserPicker value={{ ownerMobile: '9876543210' }} onChange={onChange} />);

    await waitFor(() => expect(screen.getByText(/A user with this phone already exists/)).toBeTruthy());
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('a match on BOTH email and phone (even the same existing User) blocks reporting up', async () => {
    getVendorOwnerAvailabilityMock.mockResolvedValue({ data: { available: false, conflicts: ['email', 'phone'] } });
    const onChange = vi.fn();
    render(<VendorUserPicker value={{ ownerEmail: 'vinay@example.com', ownerMobile: '9889259224' }} onChange={onChange} />);

    await waitFor(() => expect(screen.getByText(/A user with this email and phone already exists/)).toBeTruthy());
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('an availability-check error renders a blocking error and never reports anything up', async () => {
    getVendorOwnerAvailabilityMock.mockRejectedValue(new ApiRequestError('INTERNAL_ERROR', 'Could not verify this email/mobile.', 500));
    const onChange = vi.fn();
    render(<VendorUserPicker value={{ ownerEmail: 'a@example.com' }} onChange={onChange} />);

    await waitFor(() => expect(screen.getByText('Could not verify this email/mobile.')).toBeTruthy());
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('an invalid email format shows a validation error and never triggers the availability check for it', async () => {
    const onChange = vi.fn();
    render(<VendorUserPicker value={{ ownerEmail: 'not-an-email' }} onChange={onChange} />);
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(getVendorOwnerAvailabilityMock).not.toHaveBeenCalled();
  });
});
