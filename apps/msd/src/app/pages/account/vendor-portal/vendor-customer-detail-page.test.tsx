import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BreadcrumbProvider } from '../../../admin/breadcrumb-context';

import { VendorCustomerDetailPage } from './vendor-customer-detail-page';
import { ApiRequestError } from '../../../../api/rbac/client';

/**
 * Feature: member-scoped, read-only Customer Detail page (Bug 2 fix)
 * Scenario: `/account/vendor-customers/:customerId` — no member-scoped customer page existed
 * anywhere before this. Sources its header/stats from the new `GET /vendors/me/customers/:id`
 * (404s for a customer unrelated to this vendor), reuses `CustomerDetailOrders` for order
 * history, and has no status-change actions.
 *
 * Given: a member navigates here (from the Customers list, or from an Order Detail link)
 * When: the lookup succeeds / 404s / fails
 * Then: the header + stats render / a not-found state renders / an error state renders — and the
 *       back action targets "Back to Order" vs. "Back to Customer List" depending on how it was
 *       reached
 *
 * Edge cases:
 * - empty name/phone/email (falls back to "Name not added" / "No contact on file")
 * - a 404 from the backend renders the not-found state, not a crash
 */

const LONG = { timeout: 5000 };

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'tok' }) }));

const getMyCustomerMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return { ...actual, getMyCustomer: (...args: unknown[]) => getMyCustomerMock(...args) };
});

const listOrdersMock = vi.fn();
vi.mock('../../../../api/rbac/orders', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/orders')>('../../../../api/rbac/orders');
  return { ...actual, listOrders: (...args: unknown[]) => listOrdersMock(...args) };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const CUSTOMER_ID = 'cust-1';

function renderAt(state?: Record<string, unknown>) {
  return render(
    <BreadcrumbProvider>
      <MemoryRouter initialEntries={[{ pathname: `/account/vendor-customers/${CUSTOMER_ID}`, state }]}>
        <Routes>
          <Route path="/account/vendor-customers/:customerId" element={<VendorCustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </BreadcrumbProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listOrdersMock.mockResolvedValue({ data: [], meta: { total: 0 } });
});

describe('VendorCustomerDetailPage — happy path', () => {
  it('renders the header (name/phone/email) and the Total Orders / Confirmed Payments stat tiles', async () => {
    getMyCustomerMock.mockResolvedValue({
      data: { id: CUSTOMER_ID, name: 'Priya Rao', phone: '+919876543210', email: 'priya@example.com', totalOrders: 4, confirmedPaymentsTotal: 2500 },
    });
    renderAt();

    expect(await screen.findByRole('heading', { level: 1, name: 'Priya Rao' }, LONG)).toBeTruthy();
    expect(screen.getByText('+919876543210 · priya@example.com')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText(/2,500/)).toBeTruthy();
  });

  it('calls getMyCustomer with the :customerId route param', async () => {
    getMyCustomerMock.mockResolvedValue({ data: { id: CUSTOMER_ID, name: 'Priya', phone: null, email: null, totalOrders: 0, confirmedPaymentsTotal: 0 } });
    renderAt();
    await waitFor(() => expect(getMyCustomerMock).toHaveBeenCalledWith('tok', CUSTOMER_ID), LONG);
  });

  it('falls back to "Name not added" and "No contact on file" when phone/email/name are all blank', async () => {
    getMyCustomerMock.mockResolvedValue({ data: { id: CUSTOMER_ID, name: null, phone: null, email: null, totalOrders: 0, confirmedPaymentsTotal: 0 } });
    renderAt();
    expect(await screen.findByRole('heading', { level: 1, name: 'Name not added' }, LONG)).toBeTruthy();
    expect(screen.getByText('No contact on file')).toBeTruthy();
  });

  it('passes the customer id through to CustomerDetailOrders (listOrders called with it)', async () => {
    getMyCustomerMock.mockResolvedValue({ data: { id: CUSTOMER_ID, name: 'Priya', phone: null, email: null, totalOrders: 0, confirmedPaymentsTotal: 0 } });
    renderAt();
    await waitFor(() => expect(listOrdersMock).toHaveBeenCalledWith('tok', expect.objectContaining({ customerId: CUSTOMER_ID })), LONG);
  });
});

describe('VendorCustomerDetailPage — not-found / error states', () => {
  it('renders a not-found state (never a crash) when the backend 404s — customer unrelated to this vendor', async () => {
    getMyCustomerMock.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Customer not found', 404));
    renderAt();
    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
    expect(screen.getByText('Customer not found')).toBeTruthy();
    expect(screen.getByText('Back to all customers')).toBeTruthy();
  });

  it('renders a generic error message for a non-API-shaped failure', async () => {
    getMyCustomerMock.mockRejectedValue(new Error('network down'));
    renderAt();
    expect(await screen.findByRole('alert', {}, LONG)).toBeTruthy();
    expect(screen.getByText('Could not load this customer.')).toBeTruthy();
  });
});

describe('VendorCustomerDetailPage — back navigation context', () => {
  it('defaults to "Back to Customer List" (navigating to /account/vendor-customers) when reached directly', async () => {
    getMyCustomerMock.mockResolvedValue({ data: { id: CUSTOMER_ID, name: 'Priya', phone: null, email: null, totalOrders: 0, confirmedPaymentsTotal: 0 } });
    renderAt();
    await screen.findByRole('heading', { level: 1 }, LONG);

    const backBtn = Array.from(document.querySelectorAll('md-outlined-button')).find((el) => el.textContent?.includes('Back to Customer List'));
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn as Element);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendor-customers');
  });

  it('shows "Back to Order" and navigates to the stashed path when reached from an Order Detail link', async () => {
    getMyCustomerMock.mockResolvedValue({ data: { id: CUSTOMER_ID, name: 'Priya', phone: null, email: null, totalOrders: 0, confirmedPaymentsTotal: 0 } });
    renderAt({ fromOrderBackTo: '/account/orders/order-1' });
    await screen.findByRole('heading', { level: 1 }, LONG);

    const backBtn = Array.from(document.querySelectorAll('md-outlined-button')).find((el) => el.textContent?.includes('Back to Order'));
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn as Element);
    expect(navigateMock).toHaveBeenCalledWith('/account/orders/order-1');
  });
});
