import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import content from '../../../content.json';
import { Checkout } from './checkout';

const { checkoutMock, getMyProfileMock, getCartMock, getMyOrderMock, verifyPaymentMock } = vi.hoisted(() => ({
  checkoutMock: vi.fn(),
  getMyProfileMock: vi.fn(),
  getCartMock: vi.fn(),
  getMyOrderMock: vi.fn(),
  verifyPaymentMock: vi.fn(),
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ token: 'test-token', isAuthenticated: true, bootstrap: { user: { name: 'Session Name', email: null, phone: null } } }),
}));
vi.mock('../../../api/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/orders')>()),
  checkout: (...a: unknown[]) => checkoutMock(...a),
  getMyOrder: (...a: unknown[]) => getMyOrderMock(...a),
  verifyPayment: (...a: unknown[]) => verifyPaymentMock(...a),
  pay: vi.fn().mockResolvedValue({ data: { keyId: 'rzp_test', providerOrderId: 'order_rzp1', amount: '3080.00', currency: 'INR' } }),
}));
vi.mock('../../../utils/razorpay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/razorpay')>()),
  loadRazorpayScript: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../api/rbac/me', () => ({ getMyProfile: (...a: unknown[]) => getMyProfileMock(...a) }));
vi.mock('../../../api/cart', () => ({ getCart: (...a: unknown[]) => getCartMock(...a) }));


const CART = {
  id: 'c1',
  customerId: 'u1',
  items: [
    {
      id: 'ci1', cartId: 'c1', dealId: 'd1', dealPackageId: 'p1', therapistId: null, therapistPackageId: null, productId: null,
      quantity: 1, unitPrice: '3080.00',
      deal: { id: 'd1', title: 'Repair Hair Treatment', slug: 'repair-hair', salePrice: '3080', originalPrice: '4000', durationMinutes: 90, images: null, vendorId: 'm1', branchId: 'b1', vendor: { id: 'm1', businessName: 'UrbanGlow Beauty & Care' }, branch: { id: 'b1', name: 'Andheri' } },
      dealPackage: { id: 'p1', durationMinutes: 90, sellingPrice: '3080' }, therapist: null, therapistPackage: null, product: null,
    },
    {
      id: 'ci2', cartId: 'c1', dealId: null, dealPackageId: null, therapistId: null, therapistPackageId: null, productId: 'pr1',
      quantity: 2, unitPrice: '699.00', deal: null, dealPackage: null, therapist: null, therapistPackage: null,
      product: { id: 'pr1', name: 'Daily Hair Care Shampoo', image: null, imageAlt: null, price: '699', originalPrice: null, vendorId: 'm2', vendor: { id: 'm2', businessName: 'Vitality Wellness & Beauty' } },
    },
  ],
};

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
  getCartMock.mockReset().mockResolvedValue({ data: CART });
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

  it('still fills the form under StrictMode, where dev runs every effect twice', async () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <Checkout />
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(select('City').disabled).toBe(false));
    fireEvent.click(continueButton());
    await waitFor(() =>
      expect(checkoutMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ contactName: 'Neeraj Singh', shippingAddress: NEERAJ.address, shippingPincode: '110063' })),
    );
  });

  it('goes back to the cart from the details step', async () => {
    render(
      <MemoryRouter initialEntries={['/checkout']}>
        <Routes>
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/cart" element={<p>cart page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const back = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-outlined-button')).find((el) => el.textContent?.includes(content.checkout.backToCart));
      if (!button) throw new Error('no back button');
      return button as HTMLElement;
    });
    fireEvent.click(back);
    expect(await screen.findByText('cart page')).toBeTruthy();
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
    await waitFor(() => expect(document.body.textContent).toContain(content.checkout.validation.emptyState));
    expect(checkoutMock).not.toHaveBeenCalled();
  });
});

/** Item 2.3: the summary is one card per line, from the first step on. */
describe('Checkout summary', () => {
  it('lists every cart line as its own card with its member, and the total, before payment', async () => {
    renderCheckout();
    const cards = await waitFor(() => {
      const items = Array.from(document.querySelectorAll('.summary-panel li.purchase-line'));
      if (items.length !== 2) throw new Error('summary cards not ready');
      return items;
    });
    expect(cards[0].textContent).toContain('Repair Hair Treatment');
    expect(cards[0].textContent).toContain('UrbanGlow Beauty & Care');
    expect(cards[1].textContent).toContain('Vitality Wellness & Beauty');
    expect(cards[1].textContent).toContain('× 2');
    expect(screen.getByRole('region', { name: content.checkout.orderSummaryHeading }).querySelector('.summary-panel__total')?.textContent).toContain('₹4,478');
    expect(document.body.textContent).not.toContain('Your order summary will appear');
  });
});

type RzpOptions = { handler: (r: unknown) => void; modal: { ondismiss: () => void } };
const PENDING_ORDER = {
  id: 'o1', status: 'PENDING_PAYMENT', vendorNameSnapshot: 'UrbanGlow Beauty & Care', branchNameSnapshot: 'Andheri',
  subtotal: '3080.00', total: '3080.00', payments: [], items: [],
};

/** Shows where checkout navigated: path plus query. */
function Landed() {
  const { pathname, search } = useLocation();
  return <p data-testid="landed">{pathname + search}</p>;
}

/** Item 3: every payment result lands on the order result page, which reads the order's real state. */
describe('Checkout payment result', () => {
  let rzpOptions: RzpOptions;
  let rzpEvents: Record<string, () => void>;

  beforeEach(() => {
    rzpEvents = {};
    getMyOrderMock.mockReset().mockResolvedValue({ data: PENDING_ORDER });
    verifyPaymentMock.mockReset();
    window.Razorpay = vi.fn(function (this: unknown, options: RzpOptions) {
      rzpOptions = options;
      return { open: vi.fn(), on: (event: string, fn: () => void) => (rzpEvents[event] = fn) };
    }) as unknown as typeof window.Razorpay;
  });

  async function openPayment() {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/checkout', state: { orderId: 'o1' } }]}>
        <Routes>
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders/:id/confirmation" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
    );
    // Pay stays inert until the payment intent loads; click until checkout opens Razorpay.
    await waitFor(() => {
      const payButton = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Pay ₹'));
      if (payButton) fireEvent.click(payButton);
      expect(window.Razorpay).toHaveBeenCalled();
    });
  }

  const landed = () => screen.findByTestId('landed');

  it('opens the result page after a verified payment', async () => {
    verifyPaymentMock.mockResolvedValue({ data: { id: 'o1' } });
    await openPayment();
    rzpOptions.handler({ razorpay_payment_id: 'pay_1' });
    expect((await landed()).textContent).toBe('/orders/o1/confirmation');
  });

  it('still opens the result page when verification fails, so the page reads the real state', async () => {
    verifyPaymentMock.mockRejectedValue(new Error('signature'));
    await openPayment();
    rzpOptions.handler({ razorpay_payment_id: 'pay_1' });
    expect((await landed()).textContent).toBe('/orders/o1/confirmation');
  });

  it('opens the payment-failed page when the window closes after a failed attempt, and stays on checkout otherwise', async () => {
    await openPayment();
    act(() => rzpOptions.modal.ondismiss());
    expect(screen.queryByTestId('landed')).toBeNull();
    rzpEvents['payment.failed']();
    act(() => rzpOptions.modal.ondismiss());
    expect((await landed()).textContent).toBe('/orders/o1/confirmation?payment=failed');
  });
});
