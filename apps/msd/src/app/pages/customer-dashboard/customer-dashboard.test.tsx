import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import content from '../../../content.json';
import { CustomerDashboard } from './customer-dashboard';

const t = content.customerDashboard;
const m = vi.hoisted(() => ({ summary: vi.fn(), listMyOrders: vi.fn() }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test-token', isAuthenticated: true }) }));
vi.mock('../../../api/customer-dashboard', () => ({ getCustomerDashboardSummary: (...a: unknown[]) => m.summary(...a) }));
vi.mock('../../../api/orders', () => ({ listMyOrders: (...a: unknown[]) => m.listMyOrders(...a) }));

const ORDER = {
  id: '79f93d36-8e4f-4674-8a05-2334118dfcbd',
  status: 'CONFIRMED',
  total: '599.00',
  createdAt: '2026-10-29T10:00:00.000Z',
  payments: [],
  items: [
    {
      id: 'i1', dealId: null, productId: 'p1', therapistId: null, vendorId: 'm1', branchId: null, vendorNameSnapshot: 'Calm Spa',
      branchNameSnapshot: null, itemName: 'Serum', itemType: 'PRODUCT', unitPrice: '599.00', quantity: 1, lineTotal: '599.00', durationMinutes: null,
    },
  ],
};

beforeEach(() => {
  m.summary.mockReset().mockResolvedValue({ data: { totalDealCount: 4, totalProductBoughtCount: 2, cartItemCount: 3, wishlistItemCount: 0 } });
  m.listMyOrders.mockReset().mockResolvedValue({ data: [ORDER] });
});

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <CustomerDashboard />
    </MemoryRouter>,
  );

describe('CustomerDashboard', () => {
  it('heads the page with one h1 and shows the four counts as links', async () => {
    renderDashboard();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.title);
    const deals = await screen.findByRole('link', { name: new RegExp(t.stats.deals) });
    expect(deals.getAttribute('href')).toBe('/orders');
    expect(deals.textContent).toContain('4');
    expect(screen.getByRole('link', { name: new RegExp(t.stats.cart) }).getAttribute('href')).toBe('/my-account/cart');
    expect(screen.getByRole('link', { name: new RegExp(t.stats.wishlist) }).getAttribute('href')).toBe('/my-account/wishlist');
  });

  it('lists the latest orders with a link to all orders', async () => {
    renderDashboard();
    expect(await screen.findByRole('region', { name: 'Order ORD-118DFCBD' })).toBeTruthy();
    // Under the "Recent orders" h2, each order is an h3.
    expect(screen.getByRole('heading', { level: 3, name: 'Order ORD-118DFCBD' })).toBeTruthy();
    expect(m.listMyOrders).toHaveBeenCalledWith('test-token', expect.objectContaining({ pageSize: 3 }));
    expect(screen.getByRole('heading', { level: 2, name: t.recentHeading })).toBeTruthy();
  });

  it('says so when there are no orders, and shows a load error as an alert', async () => {
    m.listMyOrders.mockResolvedValue({ data: [] });
    m.summary.mockRejectedValue(new Error('offline'));
    renderDashboard();
    expect(await screen.findByText(t.noOrders)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(t.loadError));
  });
});
