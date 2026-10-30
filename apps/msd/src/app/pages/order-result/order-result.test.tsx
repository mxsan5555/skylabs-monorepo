import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '../../../api/orders';
import { OrderResult, outcomeOf } from './order-result';

const { getMyOrder } = vi.hoisted(() => ({ getMyOrder: vi.fn() }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test-token', isAuthenticated: true }) }));
vi.mock('../../../api/orders', () => ({ getMyOrder: (...a: unknown[]) => getMyOrder(...a) }));

const ORDER_ID = '11111111-2222-3333-4444-5555abcd1234';
const ORDER = {
  id: ORDER_ID,
  type: 'SERVICE',
  status: 'CONFIRMED',
  vendorNameSnapshot: 'Alok Kumar Wellness',
  branchNameSnapshot: null,
  subtotal: '3080.00',
  total: '3080.00',
  cancellationReason: null,
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
  contactEmail: 'neeraj@test.com',
  branch: null,
  payments: [{ id: 'p1', status: 'PAID', provider: 'RAZORPAY', amount: '3080.00', currency: 'INR', failureReason: null, createdAt: '2026-10-29T10:00:00.000Z' }],
  items: [
    {
      id: 'i1', dealId: 'd1', dealPackageId: 'dp1', therapistId: null, therapistPackageId: null, productId: null, vendorId: 'm1', branchId: 'b1',
      vendorNameSnapshot: 'Alok Kumar Wellness', branchNameSnapshot: 'Pacchim Vihar', itemName: 'Repair Hair Treatment', itemType: 'SERVICE',
      unitPrice: '3080.00', quantity: 1, lineTotal: '3080.00', durationMinutes: 90,
    },
  ],
} as unknown as Order;

const failedPayment = { ...ORDER.payments[0], status: 'FAILED' as const, createdAt: '2026-10-29T11:00:00.000Z' };

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/orders/:id/confirmation" element={<OrderResult />} />
        <Route path="/checkout" element={<p>checkout page</p>} />
        <Route path="/orders/:id" element={<p>order page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const heading = () => screen.findByRole('heading', { level: 1 });

beforeEach(() => {
  getMyOrder.mockReset().mockResolvedValue({ data: ORDER });
});

/** Item 3: a clear page after checkout for every result, read from the server's order. */
describe('outcomeOf', () => {
  it('maps the order state, not the URL, to the result', () => {
    expect(outcomeOf(ORDER, false)).toBe('success');
    expect(outcomeOf(ORDER, true)).toBe('success');
    expect(outcomeOf({ ...ORDER, status: 'COMPLETED' }, false)).toBe('success');
    expect(outcomeOf({ ...ORDER, status: 'CANCELLED' }, false)).toBe('cancelled');
    expect(outcomeOf({ ...ORDER, status: 'PENDING_PAYMENT', payments: [] }, false)).toBe('pending');
    expect(outcomeOf({ ...ORDER, status: 'PENDING_PAYMENT', payments: [] }, true)).toBe('failed');
    expect(outcomeOf({ ...ORDER, status: 'PENDING_PAYMENT', payments: [ORDER.payments[0], failedPayment] }, false)).toBe('failed');
    expect(outcomeOf(null, false)).toBe('error');
  });
});

describe('OrderResult', () => {
  it('thanks the customer, names the email, lists the lines with their member and focuses the heading', async () => {
    renderAt(`/orders/${ORDER_ID}/confirmation`);
    const h1 = await heading();
    expect(h1.textContent).toBe('Thank you, your order is confirmed');
    await waitFor(() => expect(document.activeElement).toBe(h1));
    expect(document.body.textContent).toContain('We emailed the confirmation to neeraj@test.com');
    const facts = Array.from(document.querySelectorAll('.status-panel__fact')).map((f) => [f.querySelector('dt')?.textContent, f.querySelector('dd')?.textContent]);
    expect(facts).toEqual([
      ['Order number', 'ORD-ABCD1234'],
      ['Placed on', '29 October 2026'],
    ]);
    const summary = screen.getByRole('region', { name: 'Order summary' });
    expect(summary.textContent).toContain('1 item');
    const card = summary.querySelector('li.purchase-line');
    expect(card?.textContent).toContain('Repair Hair Treatment');
    expect(card?.textContent).toContain('Alok Kumar Wellness');
    expect(summary.querySelector('.purchase-summary__total')?.textContent).toContain('₹3,080');
    expect(getMyOrder).toHaveBeenCalledWith('test-token', ORDER_ID);
  });

  it('shows the payment-failed page with Pay now, which reopens checkout for the same order', async () => {
    getMyOrder.mockResolvedValue({ data: { ...ORDER, status: 'PENDING_PAYMENT', payments: [failedPayment] } });
    renderAt(`/orders/${ORDER_ID}/confirmation`);
    expect((await heading()).textContent).toBe('Your payment did not go through');
    expect(document.querySelector('.status-panel--error')).not.toBeNull();
    fireEvent.click(screen.getByText('Pay now'));
    expect(await screen.findByText('checkout page')).toBeTruthy();
  });

  it('treats a failure reported by checkout as failed while the order is still unpaid', async () => {
    getMyOrder.mockResolvedValue({ data: { ...ORDER, status: 'PENDING_PAYMENT', payments: [] } });
    renderAt(`/orders/${ORDER_ID}/confirmation?payment=failed`);
    expect((await heading()).textContent).toBe('Your payment did not go through');
  });

  it('says the order is waiting when nothing failed yet', async () => {
    getMyOrder.mockResolvedValue({ data: { ...ORDER, status: 'PENDING_PAYMENT', payments: [] } });
    renderAt(`/orders/${ORDER_ID}/confirmation`);
    expect((await heading()).textContent).toBe('Your order is waiting for payment');
  });

  it('shows an error page with Try again when the order cannot load, and recovers', async () => {
    getMyOrder.mockRejectedValueOnce(new Error('offline'));
    renderAt(`/orders/${ORDER_ID}/confirmation`);
    expect((await heading()).textContent).toBe('We could not load your order');
    // Nothing to summarise without the order: no facts, no summary column.
    expect(document.querySelector('.status-panel__facts')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Order summary' })).toBeNull();
    expect(screen.getByRole('link', { name: /Contact us/ }).getAttribute('href')).toBe('/contact');
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Thank you, your order is confirmed'));
  });

  it('is kept out of search results', async () => {
    renderAt(`/orders/${ORDER_ID}/confirmation`);
    await heading();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });
});
