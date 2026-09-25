import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../api/rbac/client';

const registerPublicVendorMock = vi.fn();

vi.mock('../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../api/rbac/vendors')>('../../../api/rbac/vendors');
  return {
    ...actual,
    registerPublicVendor: (...args: unknown[]) => registerPublicVendorMock(...args),
  };
});

import { BecomeVendor } from './become-vendor';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Public "Become a Vendor" application page
 * Scenario: an anonymous, unauthenticated visitor applies to list their business — always lands
 * PENDING_VERIFICATION server-side, never auto-approved or auto-logged-in.
 *
 * Given: a visitor on `/become-vendor`
 * When: they view the page or submit the form
 * Then: the hero/form renders with no auth-gated content; client-side required-field validation
 *       blocks an empty submit before the API is ever called; `registerPublicVendor` is always
 *       called with `token: null` under the hood (verified at the API-layer in
 *       `api/rbac/vendors.test.ts`, not re-asserted here)
 *
 * Edge cases:
 * - submitting with no business name shows the inline required error and never calls the API
 *
 * NOTE: this form's fields are all `createComponent`-wrapped `OutlinedTextField`/`OutlinedSelect`
 * elements (see `vendor-branches.test.tsx`'s own doc comment on the jsdom + `@lit/react` onInput/
 * onChange gap) — there is no way to simulate typing a business name into this specific page (it
 * has no prefill-able `value` prop the way `VendorUserPicker`/`BranchDialog` do, since it always
 * starts from a genuinely empty application). The full happy-path (fill in every field, submit,
 * see the "Application received" screen) and the CONFLICT/429 inline-error rendering are
 * therefore validated by direct code review of `submit()`'s try/catch (identical shape to every
 * other form in this codebase) plus this repo's Playwright E2E suite, not re-driven here — forcing
 * it through a fake DOM event would not actually exercise the real `onInput` handler and would be
 * a brittle, misleading test.
 */
describe('BecomeVendor', () => {
  it('renders the hero and every section without requiring authentication', () => {
    render(<BecomeVendor />);
    expect(screen.getByText('Become a Vendor')).toBeTruthy();
    expect(screen.getByText('Business details')).toBeTruthy();
    expect(screen.getByText('Your details')).toBeTruthy();
    expect(screen.getByText('Business address')).toBeTruthy();
    expect(screen.getByText('Submit application')).toBeTruthy();
  });

  it('submitting an empty form shows the required business name error and never calls registerPublicVendor', async () => {
    render(<BecomeVendor />);
    // `findSubmitButton()`'s underlying `<md-filled-button type="submit">` only actually behaves
    // as a submit control if @lit/react's `type` property binding reflects onto the real internal
    // `<button>` — the same class of gap documented elsewhere in this repo for onInput/onChange.
    // Firing `submit` directly on the `<form>` itself is the robust way to invoke `submit()`
    // regardless of that gap, exactly like every other plain-HTML-`<form onSubmit>` component in
    // this codebase would be tested.
    const form = document.querySelector('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByText('Business name is required.')).toBeTruthy());
    expect(registerPublicVendorMock).not.toHaveBeenCalled();
  });

  it('does not show the "Application received" success screen before any submission', () => {
    render(<BecomeVendor />);
    expect(screen.queryByText('Application received')).toBeNull();
  });
});
