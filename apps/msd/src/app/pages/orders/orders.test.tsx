import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import content from '../../../content.json';
import { Orders } from './orders';

const t = content.orders;
const { listMyOrders } = vi.hoisted(() => ({ listMyOrders: vi.fn() }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test-token', isAuthenticated: true }) }));
vi.mock('../../../api/orders', () => ({ listMyOrders: (...a: unknown[]) => listMyOrders(...a) }));

const order = (id: string, status: string) => ({
  id,
  status,
  total: '100.00',
  createdAt: '2026-10-29T10:00:00.000Z',
  payments: [],
  items: [
    {
      id: `${id}-i`, dealId: 'd1', productId: null, therapistId: null, vendorId: 'm1', branchId: null, vendorNameSnapshot: 'Calm Spa',
      branchNameSnapshot: null, itemName: `Item ${id}`, itemType: 'SERVICE', unitPrice: '100.00', quantity: 1, lineTotal: '100.00', durationMinutes: null,
    },
  ],
});

beforeEach(() => {
  listMyOrders.mockReset().mockResolvedValue({
    data: [order('aaaaaaaa-0000-0000-0000-00000000000a', 'CONFIRMED'), order('bbbbbbbb-0000-0000-0000-00000000000b', 'CANCELLED'), order('cccccccc-0000-0000-0000-00000000000c', 'PENDING_PAYMENT')],
  });
});

const renderOrders = () =>
  render(
    <MemoryRouter>
      <Orders />
    </MemoryRouter>,
  );

describe('Orders', () => {
  it('heads the page with one h1 and lists every order except those awaiting payment', async () => {
    renderOrders();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.title);
    await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(2));
    expect(screen.queryByText('Item cccccccc-0000-0000-0000-00000000000c')).toBeNull();
  });

  it('shows only cancelled orders under the Cancelled chip', async () => {
    renderOrders();
    await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(2));
    const chip = (Array.from(document.querySelectorAll('md-filter-chip')) as (HTMLElement & { label?: string })[]).find((c) => (c.label ?? c.getAttribute('label')) === t.filters.cancelled) as HTMLElement;
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getAllByRole('region')).toHaveLength(1));
    expect(screen.getByRole('region').textContent).toContain(t.statuses.CANCELLED);
  });

  it('shows the empty state with a way to the deals', async () => {
    listMyOrders.mockResolvedValue({ data: [] });
    renderOrders();
    expect(await screen.findByText(t.empty.title)).toBeTruthy();
  });
});
