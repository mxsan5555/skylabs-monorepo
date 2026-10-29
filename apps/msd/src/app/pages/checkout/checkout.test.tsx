import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Checkout } from './checkout';

const { checkoutMock, getMyProfileMock } = vi.hoisted(() => ({ checkoutMock: vi.fn(), getMyProfileMock: vi.fn() }));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token', isAuthenticated: true, bootstrap: { user: { name: 'Session Name', email: null, phone: null } } }),
}));
vi.mock('../../../api/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/orders')>()),
  checkout: (...a: unknown[]) => checkoutMock(...a),
  getMyOrder: vi.fn(),
  pay: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('../../../api/rbac/me', () => ({ getMyProfile: (...a: unknown[]) => getMyProfileMock(...a) }));


const NEERAJ = {
  id: 'u1',
  name: 'Neeraj Singh',
  email: 'neeraj@test.com',
  phone: '+919177889991',
  address: '1457, D Block, Pacchim Vihar',
  state: 'Delhi',
  city: 'New Delhi',
  pincode: '110063',
};

type Select = HTMLElement & { value: string; label: string; disabled: boolean };
const select = (label: string) =>
  (Array.from(document.querySelectorAll('md-outlined-select')) as Select[]).find((el) => el.label === label) as Select;
const continueButton = () =>
  Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Continue')) as HTMLElement;

function renderCheckout() {
  render(
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  checkoutMock.mockReset().mockReturnValue(new Promise(vi.fn()));
  getMyProfileMock.mockReset().mockResolvedValue({ data: NEERAJ });
});

/** Item 2.2: the signed-in customer's saved details fill the form; State then City are lists. */
describe('Checkout details', () => {
  it('fills every field from the saved profile and sends them on Continue', async () => {
    renderCheckout();
    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalledWith('test-token'));
    // The saved state is in once City unlocks (md-select's own value lags under jsdom).
    await waitFor(() => expect(select('City').disabled).toBe(false));
    fireEvent.click(continueButton());
    await waitFor(() =>
      expect(checkoutMock).toHaveBeenCalledWith('test-token', {
        contactName: 'Neeraj Singh',
        contactPhone: '9177889991',
        contactEmail: 'neeraj@test.com',
        shippingAddress: '1457, D Block, Pacchim Vihar',
        shippingState: 'Delhi',
        shippingCity: 'New Delhi',
        shippingPincode: '110063',
      }),
    );
  });

  it('offers the India states, and only the cities of the chosen state', async () => {
    renderCheckout();
    // The saved state is in once City unlocks (md-select's own value lags under jsdom).
    await waitFor(() => expect(select('City').disabled).toBe(false));
    expect(Array.from(select('State').querySelectorAll('md-select-option')).map((o) => o.textContent)).toContain('Karnataka');
    expect(Array.from(select('City').querySelectorAll('md-select-option')).map((o) => o.textContent)).toContain('New Delhi');
    expect(Array.from(select('City').querySelectorAll('md-select-option')).map((o) => o.textContent)).not.toContain('Bengaluru');
  });

  it('starts with City locked and asks for the missing fields when nothing is saved', async () => {
    getMyProfileMock.mockResolvedValue({ data: { ...NEERAJ, address: null, state: null, city: null, pincode: null } });
    renderCheckout();
    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled());
    expect(select('City').disabled).toBe(true);
    fireEvent.click(continueButton());
    await waitFor(() => expect(document.body.textContent).toContain('State is required.'));
    expect(checkoutMock).not.toHaveBeenCalled();
  });
});
