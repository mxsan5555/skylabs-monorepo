import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BecomeVendor } from './become-vendor';

const registerPublicVendorMock = vi.fn();

vi.mock('../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<
    typeof import('../../../api/rbac/vendors')
  >('../../../api/rbac/vendors');
  return {
    ...actual,
    registerPublicVendor: (...args: unknown[]) =>
      registerPublicVendorMock(...args),
  };
});

vi.mock('../../../api/catalog', () => ({
  getCatalogContactUs: () => Promise.resolve({ data: null }),
}));

const render = (ui: React.ReactElement) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BecomeVendor', () => {
  it('renders the hero and every section without requiring authentication', () => {
    render(<BecomeVendor />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Become a member' }),
    ).toBeTruthy();
    expect(screen.getByText('Business details')).toBeTruthy();
    expect(screen.getByText('Your details')).toBeTruthy();
    expect(screen.getByText('Business address')).toBeTruthy();
    expect(screen.getByText('Submit application')).toBeTruthy();
  });

  it('submitting an empty form shows the required business name error and never calls registerPublicVendor', async () => {
    render(<BecomeVendor />);
    const form = document.querySelector('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);

    await waitFor(() =>
      expect(screen.getByText('Business name is required.')).toBeTruthy(),
    );
    expect(registerPublicVendorMock).not.toHaveBeenCalled();
  });

  it('does not show the old staff-only 403 notice and keeps the submit button enabled by default', () => {
    render(<BecomeVendor />);
    expect(screen.queryByText(/created by our team/i)).toBeNull();
    const button = Array.from(
      document.querySelectorAll('md-filled-button'),
    ).find((el) => el.textContent?.includes('Submit application'));
    expect(
      button?.hasAttribute('disabled') ||
        (button as unknown as { disabled?: boolean })?.disabled,
    ).toBe(false);
  });

  it('does not show the "Application received" success screen before any submission', () => {
    render(<BecomeVendor />);
    expect(screen.queryByText('Application received')).toBeNull();
  });
});
