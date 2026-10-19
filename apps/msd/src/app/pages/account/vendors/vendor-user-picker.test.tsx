import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../../api/rbac/client';

const getVendorOwnerAvailabilityMock = vi.fn();
const createVendorMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    getVendorOwnerAvailability: (...args: unknown[]) => getVendorOwnerAvailabilityMock(...args),
    createVendor: (...args: unknown[]) => createVendorMock(...args),
  };
});

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { VendorOwnerLoginStep } from './vendor-user-picker';

beforeEach(() => {
  vi.clearAllMocks();
  getVendorOwnerAvailabilityMock.mockResolvedValue({ data: { available: true, conflicts: [] } });
});

function fields() {
  return Array.from(document.querySelectorAll('md-outlined-text-field'));
}

function findButtonByText(text: string): HTMLElement {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.trim() === text);
  if (!button) throw new Error(`Button "${text}" not found`);
  return button as HTMLElement;
}

/**
 * Feature: VendorOwnerLoginStep — "Add Member" Step 1 of 4 (Owner & Login)
 * Scenario: a self-contained screen (own submit, not just field collection) — First name and
 * Mobile are required, Last name/Email stay optional. Mobile is always a plain 10-digit value in
 * state with `+91` shown as a fixed prefix. Submitting calls `createVendor` directly and hands
 * the created Member to `onCreated`.
 *
 * NOTE: per this suite's existing documented jsdom + @lit/react gap (md-outlined-text-field's
 * onInput never fires via simulated typing), field values are driven by directly mutating the
 * underlying custom element's `.value` property and dispatching a real `input` event — the same
 * workaround this repo's other wizard-field suites use.
 */
describe('VendorOwnerLoginStep', () => {
  it('renders 4 identity fields with a fixed +91 prefix shown next to Mobile', () => {
    render(<VendorOwnerLoginStep onCreated={vi.fn()} />);
    expect(fields().length).toBe(4);
    expect(screen.getByText('+91')).toBeTruthy();
  });

  it('blocks submit and shows "Mobile number is required." when mobile is empty', async () => {
    render(<VendorOwnerLoginStep onCreated={vi.fn()} />);
    fireEvent.click(findButtonByText('Create Login & Open Details'));
    await waitFor(() => expect(screen.getByText('Mobile number is required.')).toBeTruthy());
    expect(createVendorMock).not.toHaveBeenCalled();
  });

  it('blocks submit and shows "First name is required." when first name is empty', async () => {
    render(<VendorOwnerLoginStep onCreated={vi.fn()} />);
    fireEvent.click(findButtonByText('Create Login & Open Details'));
    await waitFor(() => expect(screen.getByText('First name is required.')).toBeTruthy());
    expect(createVendorMock).not.toHaveBeenCalled();
  });

  it('a mobile that is not 10 digits shows "Enter exactly 10 digits." on blur', () => {
    render(<VendorOwnerLoginStep onCreated={vi.fn()} />);
    const mobileField = fields()[2];
    (mobileField as unknown as { value: string }).value = '98765';
    fireEvent.input(mobileField);
    fireEvent.blur(mobileField);
    expect(screen.getByText('Enter exactly 10 digits.')).toBeTruthy();
  });

  it('a mobile starting with 5 or below shows the "must start with 6, 7, 8 or 9" message on blur', () => {
    render(<VendorOwnerLoginStep onCreated={vi.fn()} />);
    const mobileField = fields()[2];
    (mobileField as unknown as { value: string }).value = '5123456789';
    fireEvent.input(mobileField);
    fireEvent.blur(mobileField);
    expect(screen.getByText('Mobile number must start with 6, 7, 8 or 9.')).toBeTruthy();
  });

  it('an invalid email shows "Enter a valid email address." on blur; email stays optional otherwise', () => {
    render(<VendorOwnerLoginStep onCreated={vi.fn()} />);
    const emailField = fields()[3];
    (emailField as unknown as { value: string }).value = 'not-an-email';
    fireEvent.input(emailField);
    fireEvent.blur(emailField);
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
  });

  it('submits ownerFirstName/ownerLastName/ownerEmail/ownerMobile (plain 10-digit mobile) and reports the created vendor up', async () => {
    const created = { id: 'vendor-1', businessName: null };
    createVendorMock.mockResolvedValue({ data: created });
    const onCreated = vi.fn();
    render(<VendorOwnerLoginStep onCreated={onCreated} />);

    const [firstName, lastName, mobileField, emailField] = fields();
    (firstName as unknown as { value: string }).value = 'Ramesh';
    fireEvent.input(firstName);
    (lastName as unknown as { value: string }).value = 'Kumar';
    fireEvent.input(lastName);
    (mobileField as unknown as { value: string }).value = '9876543210';
    fireEvent.input(mobileField);
    (emailField as unknown as { value: string }).value = 'ramesh@example.com';
    fireEvent.input(emailField);

    fireEvent.click(findButtonByText('Create Login & Open Details'));

    await waitFor(() => expect(createVendorMock).toHaveBeenCalledOnce());
    const [, input] = createVendorMock.mock.calls[0];
    expect(input).toEqual({
      ownerFirstName: 'Ramesh',
      ownerLastName: 'Kumar',
      ownerEmail: 'ramesh@example.com',
      ownerMobile: '9876543210',
    });
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('a 409 phone conflict shows the per-field message and does not call onCreated', async () => {
    createVendorMock.mockRejectedValue(new ApiRequestError('CONFLICT', 'taken', 409, { conflicts: ['phone'] }));
    const onCreated = vi.fn();
    render(<VendorOwnerLoginStep onCreated={onCreated} />);

    const [firstName, , mobileField] = fields();
    (firstName as unknown as { value: string }).value = 'Ramesh';
    fireEvent.input(firstName);
    (mobileField as unknown as { value: string }).value = '9876543210';
    fireEvent.input(mobileField);

    fireEvent.click(findButtonByText('Create Login & Open Details'));

    await waitFor(() => expect(screen.getByText('This mobile number already belongs to an account.')).toBeTruthy());
    expect(onCreated).not.toHaveBeenCalled();
  });
});
