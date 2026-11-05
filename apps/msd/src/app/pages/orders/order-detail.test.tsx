import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '../../../api/orders';
import content from '../../../content.json';
import { OrderDetail } from './order-detail';

const t = content.orderDetail;
const m = vi.hoisted(() => ({ getMyOrder: vi.fn(), cancelMyOrder: vi.fn() }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test-token', isAuthenticated: true }) }));
vi.mock('../../../api/orders', () => ({
  getMyOrder: (...a: unknown[]) => m.getMyOrder(...a),
  cancelMyOrder: (...a: unknown[]) => m.cancelMyOrder(...a),
}));

const ID = '79f93d36-8e4f-4674-8a05-2334118dfcbd';
const line = (id: string, name: string, member: string, extra: Record<string, unknown>) => ({
  id, dealId: null, dealPackageId: null, therapistId: null, therapistPackageId: null, productId: null, vendorId: `m-${id}`, branchId: null,
  vendorNameSnapshot: member, branchNameSnapshot: null, itemName: name, itemType: 'SERVICE', unitPrice: '100.00', quantity: 1, lineTotal: '100.00',
  durationMinutes: null, image: null, ...extra,
});
const ORDER = {
  id: ID,
  type: 'MIXED',
  status: 'CONFIRMED',
  total: '2679.00',
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
  shippingAddress: '1457, D Block, Pacchim Vihar',
  shippingCity: 'New Delhi',
  shippingState: 'Delhi',
  shippingPincode: '110063',
  payments: [{ id: 'p1', status: 'PAID', provider: 'RAZORPAY', amount: '2679.00', currency: 'INR', failureReason: null, createdAt: '2026-10-29T10:00:00.000Z' }],
  items: [
    line('i1', 'Eyelash Conditioning Serum', 'Vitality Wellness & Beauty', { itemType: 'PRODUCT', productId: 'p1', image: 'https://img.test/serum.jpg', lineTotal: '599.00' }),
    line('i2', 'Steam & Sauna Session', 'UrbanGlow Beauty & Care', { dealId: 'd2', branchNameSnapshot: 'Connaught Place', lineTotal: '2080.00', durationMinutes: 60 }),
  ],
} as unknown as Order;

function renderDetail() {
  render(
    <MemoryRouter initialEntries={[`/orders/${ID}`]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/checkout" element={<p>checkout page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const summary = () => screen.getByRole('region', { name: t.summaryHeading });
const steps = () => within(screen.getByRole('list', { name: t.progressLabel })).getAllByRole('listitem');
/** A step's visible label, without its marker or the screen-reader "completed". */
const stepLabel = (li: HTMLElement) => li.querySelector('.step-indicator__label')?.firstChild?.textContent;
const buttonWith = (text: string) =>
  Array.from(document.querySelectorAll('md-filled-button, md-outlined-button, md-text-button')).find((b) => b.textContent?.includes(text)) as HTMLElement;

beforeEach(() => {
  m.getMyOrder.mockReset().mockResolvedValue({ data: ORDER });
  m.cancelMyOrder.mockReset().mockResolvedValue({ data: { ...ORDER, status: 'CANCELLED' } });
});

describe('OrderDetail', () => {
  it('heads the page with the short order number, the date and the status, and never the full id', async () => {
    renderDetail();
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Order ORD-118DFCBD');
    expect(document.body.textContent).toContain('29 October 2026');
    expect(document.querySelector('sky-badge')?.getAttribute('status')).toBe('success');
    expect(screen.getByRole('link', { name: t.breadcrumbOrders }).getAttribute('href')).toBe('/orders');
    expect(document.body.textContent).not.toContain(ID);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });

  it('shows one progress list for the order, with the current step marked', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1 });
    const items = steps();
    expect(items.map(stepLabel)).toEqual([t.steps.placed, t.steps.confirmed, t.steps.delivered]);
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(screen.getAllByRole('list', { name: t.progressLabel })).toHaveLength(1);
  });

  it('lists every line with its own member and a new-tab link to its detail page', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1 });
    const lines = Array.from(document.querySelectorAll('li.purchase-line'));
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain('Vitality Wellness & Beauty');
    expect(lines[1].textContent).toContain('UrbanGlow Beauty & Care · Connaught Place');
    const link = screen.getByRole('link', { name: /Eyelash Conditioning Serum/ });
    expect(link.getAttribute('href')).toBe('/products/p1');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('summarises payment, method, date and total, and shows the delivery address', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1 });
    const pairs = Array.from(summary().querySelectorAll('dl > div')).map((row) => [row.querySelector('dt')?.textContent, row.querySelector('dd')?.textContent]);
    expect(pairs).toEqual([
      [t.rows.payment, t.paymentStatuses.PAID],
      [t.rows.paidVia, t.providers.RAZORPAY],
      [t.rows.placedOn, '29 October 2026'],
      [t.labels.total, '₹2,679'],
    ]);
    expect(screen.getByRole('region', { name: t.deliveryHeading }).textContent).toContain('1457, D Block, Pacchim Vihar');
  });

  it('cancels only after the customer confirms in the dialog', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1 });
    const action = Array.from(summary().querySelectorAll('md-outlined-button')).find((b) => b.textContent?.includes(t.actions.cancelOrder)) as HTMLElement;
    fireEvent.click(action);
    expect(m.cancelMyOrder).not.toHaveBeenCalled();
    fireEvent.click(buttonWith(t.cancelDialog.confirm));
    await waitFor(() => expect(m.cancelMyOrder).toHaveBeenCalledWith('test-token', ID));
    await waitFor(() => expect(document.querySelector('sky-badge')?.getAttribute('status')).toBe('error'));
  });

  it('a cancelled, paid order shows Cancelled as the last step and the refund notice, with no Cancel action', async () => {
    m.getMyOrder.mockResolvedValue({ data: { ...ORDER, status: 'CANCELLED' } });
    renderDetail();
    await screen.findByRole('heading', { level: 1 });
    expect(steps().map(stepLabel)).toEqual([t.steps.placed, t.steps.cancelled]);
    expect(screen.getByRole('heading', { level: 2, name: t.refundHeading })).toBeTruthy();
    expect(document.querySelector('.step-indicator--error')).not.toBeNull();
    expect(buttonWith(t.actions.cancelOrder)).toBeUndefined();
  });

  it('a failed payment shows the error notice, and Pay opens checkout for this order', async () => {
    m.getMyOrder.mockResolvedValue({
      data: { ...ORDER, status: 'PENDING_PAYMENT', payments: [{ ...ORDER.payments[0], status: 'FAILED', failureReason: 'Card declined' }] },
    });
    renderDetail();
    expect(await screen.findByRole('heading', { level: 2, name: t.paymentFailedHeading })).toBeTruthy();
    expect(document.body.textContent).toContain('Card declined');
    fireEvent.click(buttonWith(`${t.actions.payPrefix} ₹2,679`));
    expect(await screen.findByText('checkout page')).toBeTruthy();
  });

  it('shows not found when the order cannot load', async () => {
    m.getMyOrder.mockRejectedValue(new Error('404'));
    renderDetail();
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(t.notFound.heading);
  });
});
