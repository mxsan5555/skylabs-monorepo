import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PendingVendorOwner } from './vendor-user-picker';
import type { Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const createVendorMock = vi.fn();
const updateVendorMock = vi.fn();

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'tok', can: () => true }),
}));

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    createVendor: (...args: unknown[]) => createVendorMock(...args),
    updateVendor: (...args: unknown[]) => updateVendorMock(...args),
  };
});

// VendorUserPicker itself can't be driven via simulated typing under this repo's documented
// jsdom + @lit/react gap (see vendor-branches.test.tsx's own doc comment on md-outlined-* onInput/
// onChange never firing) — stubbed here with a button that calls `onChange` with a fixed
// `PendingVendorOwner` payload, so this suite can test `saveUser`'s own logic (what
// `vendor-pipeline.tsx` actually owns) in isolation from that unrelated gap.
vi.mock('./vendor-user-picker', () => ({
  VendorUserPicker: ({ onChange }: { onChange: (v: PendingVendorOwner | null) => void }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onChange({ ownerFirstName: 'New', ownerLastName: 'Owner', ownerEmail: 'new@example.com', ownerMobile: '9876543210' })
        }
      >
        pick-identity
      </button>
    </div>
  ),
}));

import { VendorPipeline } from './vendor-pipeline';
import { VendorNewPage } from './vendor-new-page';

function findButtonByText(text: string): HTMLElement {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.trim() === text);
  if (!button) throw new Error(`Button "${text}" not found`);
  return button as HTMLElement;
}

const CREATED_VENDOR: Vendor = {
  id: 'vendor-1',
  businessName: null,
  slug: null,
  ownerUserId: 'new-user-1',
  kycStatus: 'PENDING',
  kycRejectionReason: null,
  status: 'PROFILE_INCOMPLETE',
  statusReason: null,
  createdByUserId: 'admin-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: false,
  offersProduct: false,
  offersTherapy: false,
  owner: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
});

/**
 * Feature: VendorPipeline#saveUser — owner is always a brand-new identity, never an existing User
 * Scenario: the picker only ever supplies typed name/email/mobile fields — there is no
 * "existing user" mode anymore (see `PendingVendorOwner`'s own shape). `saveUser` sends exactly
 * those identity fields, never `ownerUserId`; the backend independently creates the User (or
 * rejects if the email/mobile is already taken).
 *
 * Given: no vendor yet (fresh "Add Vendor")
 * When: the admin types an owner identity and clicks "Create Vendor"
 * Then: createVendor is called with the identity fields only
 *
 * Edge cases:
 * - a failed create (e.g. the backend rejects because the email/phone is already taken) surfaces
 *   its message and does not advance past the picker
 *
 * NOTE: "Create Vendor" being disabled until an owner is picked (`disabled={!pendingOwner ||
 * saving}` on a `createComponent`-wrapped `FilledButton`) is NOT re-verified here — this repo's
 * installed `@lit/react@1.0.8` reflects property bindings (not just event bindings, per
 * `vendor-branches.test.tsx`'s own doc comment) onto the underlying custom element via a
 * `useLayoutEffect` that never fires under this jsdom + React 19 combination, so neither the
 * `.disabled` property nor a `disabled` attribute is ever observable in this test environment
 * regardless of the real (correct) source. Covered instead by direct code review of the
 * `disabled={!pendingOwner || saving}` prop plus this repo's Playwright E2E suite.
 */
describe('VendorPipeline#saveUser — owner is always a brand-new identity', () => {
  it('redirects back to the vendor list immediately after a fresh vendor is created', async () => {
    createVendorMock.mockResolvedValue({ data: CREATED_VENDOR });
    render(<VendorNewPage />);

    fireEvent.click(screen.getByText('pick-identity'));
    fireEvent.click(findButtonByText('Create Vendor'));

    await waitFor(() => expect(createVendorMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith(`/account/vendors?vendorId=${CREATED_VENDOR.id}`, { replace: true }));
  });

  it('submitting sends ownerFirstName/ownerLastName/ownerEmail/ownerMobile, never ownerUserId', async () => {
    createVendorMock.mockResolvedValue({ data: CREATED_VENDOR });
    const onVendorChange = vi.fn();
    render(<VendorPipeline token="tok" initialVendor={null} onVendorChange={onVendorChange} />);

    fireEvent.click(screen.getByText('pick-identity'));
    fireEvent.click(findButtonByText('Create Vendor'));

    await waitFor(() => expect(createVendorMock).toHaveBeenCalledOnce());
    const [token, input] = createVendorMock.mock.calls[0];
    expect(token).toBe('tok');
    expect(input).toEqual({
      ownerFirstName: 'New',
      ownerLastName: 'Owner',
      ownerEmail: 'new@example.com',
      ownerMobile: '9876543210',
    });
    expect(input).not.toHaveProperty('ownerUserId');
    expect(onVendorChange).toHaveBeenCalledWith(CREATED_VENDOR);
  });

  it('a failed create (e.g. email/phone already taken) shows the error and does not call onVendorChange (stays on the picker)', async () => {
    createVendorMock.mockRejectedValue(
      new ApiRequestError('CONFLICT', 'A user with this email or phone already exists. Please use a different email/phone to create this Vendor.', 409),
    );
    const onVendorChange = vi.fn();
    render(<VendorPipeline token="tok" initialVendor={null} onVendorChange={onVendorChange} />);

    fireEvent.click(screen.getByText('pick-identity'));
    fireEvent.click(findButtonByText('Create Vendor'));

    await waitFor(() =>
      expect(
        screen.getByText('A user with this email or phone already exists. Please use a different email/phone to create this Vendor.'),
      ).toBeTruthy(),
    );
    expect(onVendorChange).not.toHaveBeenCalled();
    expect(screen.getByText('pick-identity')).toBeTruthy(); // still on the picker, not advanced
  });
});

/**
 * Feature: VendorPipeline — Rules of Hooks across the vendor-creation transition
 * Scenario: regression test for the real "/account/vendors/new opens straight into the
 * ErrorBoundary" bug (confirmed via a live captured stack trace).
 *
 * Root cause: `refreshVendorAfterKycChange` (a `useCallback`) used to be declared AFTER the
 * `if (!vendor) return ...` early-return guard, further down this same component. On the very
 * first render — no vendor yet, `VendorNewPage` always mounts `VendorPipeline` with
 * `initialVendor={null}` — that early return fires and the hook is never called, so React
 * records one fewer hook for this fiber. The moment `saveUser()` resolves and `vendor` flips
 * from null to the newly-created row on this SAME mounted instance, the component renders past
 * the early return and calls one more hook than the previous render. React detects the mismatch
 * and throws "Rendered more hooks than during the previous render", which the app's top-level
 * ErrorBoundary catches and renders as "Something went wrong" — exactly the point where Step 1
 * (Profile & KYC) should have appeared.
 *
 * The fix moves that `useCallback` above the early return so it's called unconditionally on
 * every render, matching every other hook in this component (Rules of Hooks: same hooks, same
 * order, every render). This suite must `waitFor` all the way to the post-creation Step 1
 * render — asserting only on the `createVendor` call site (as the suite above already does)
 * lets a hook-order exception fire on a later microtask/render commit without ever failing the
 * specific test (confirmed: with the bug reintroduced, vitest logs an "Unhandled Error" but
 * still exits 0 — this suite is what actually turns that into a failing test).
 */
describe('VendorPipeline — direct /account/vendors/new navigation, initial wizard render (regression: hook-order crash after Create Vendor)', () => {
  it('never throws when transitioning from no-vendor (fresh "Add Vendor") to a just-created vendor, and Step 1 renders', async () => {
    createVendorMock.mockResolvedValue({ data: CREATED_VENDOR });
    const onVendorChange = vi.fn();

    // Matches the real /account/vendors/new route exactly: VendorNewPage always mounts
    // VendorPipeline with `initialVendor={null}` (see vendor-new-page.tsx) — the owner-picker
    // screen is the actual initial wizard render for a direct navigation to that route.
    render(<VendorPipeline token="tok" initialVendor={null} onVendorChange={onVendorChange} />);
    expect(screen.getByText('pick-identity')).toBeTruthy();

    fireEvent.click(screen.getByText('pick-identity'));
    fireEvent.click(findButtonByText('Create Vendor'));

    // The exact transition that crashed: vendor flips from null to CREATED_VENDOR on the same
    // mounted VendorPipeline instance. Waiting for Step 1's own heading forces this test through
    // the render where the hook-order mismatch used to throw, instead of stopping at the
    // `createVendor` call site.
    await waitFor(() => expect(screen.getByText('Step 1: Profile & KYC')).toBeTruthy());
    expect(onVendorChange).toHaveBeenCalledWith(CREATED_VENDOR);
    // The picker is gone — this is a real step-1 render, not the ErrorBoundary's fallback.
    expect(screen.queryByText('pick-identity')).toBeNull();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
