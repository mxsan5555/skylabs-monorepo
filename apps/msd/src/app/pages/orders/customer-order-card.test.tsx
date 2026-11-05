import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Order } from '../../../api/orders';
import content from '../../../content.json';
import { CustomerOrderCard } from './customer-order-card';

const t = content.orders;

const item = (id: string, name: string, member: string, extra: Record<string, unknown>) => ({
  id,
  dealId: null,
  dealPackageId: null,
  therapistId: null,
  therapistPackageId: null,
  productId: null,
  vendorId: `m-${member}`,
  branchId: null,
  vendorNameSnapshot: member,
  branchNameSnapshot: null,
  itemName: name,
  itemType: 'SERVICE',
  unitPrice: '100.00',
  quantity: 1,
  lineTotal: '100.00',
  durationMinutes: null,
  image: null,
  ...extra,
});

/** One combined checkout = one order with lines from several members (the item 3 bug). */
const ORDER = {
  id: '79f93d36-8e4f-4674-8a05-2334118dfcbd',
  status: 'CONFIRMED',
  total: '5278.00',
  createdAt: '2026-10-29T10:00:00.000Z',
  payments: [],
  items: [
    item('i1', 'Eyelash Conditioning Serum', 'Vitality Wellness & Beauty', { itemType: 'PRODUCT', productId: 'p1', image: 'https://img.test/serum.jpg', lineTotal: '599.00' }),
    item('i2', 'Steam & Sauna Session', 'UrbanGlow Beauty & Care', { dealId: 'd2', branchNameSnapshot: 'Connaught Place', image: 'https://img.test/sauna.jpg', lineTotal: '2080.00', durationMinutes: 60 }),
    item('i3', 'Head & Neck Relaxation Massage', 'GlowNest Wellness Studio', { dealId: 'd3', image: null, lineTotal: '2200.00' }),
  ],
} as unknown as Order;

function renderCard(onViewDetails = vi.fn()) {
  render(
    <MemoryRouter>
      <CustomerOrderCard order={ORDER} onViewDetails={onViewDetails} />
    </MemoryRouter>,
  );
  return onViewDetails;
}

describe('CustomerOrderCard', () => {
  it('names the order by its short number with the date and a status badge', () => {
    renderCard();
    const region = screen.getByRole('region', { name: 'Order ORD-118DFCBD' });
    expect(region.textContent).toContain('29 October 2026');
    expect(region.querySelector('sky-badge')?.getAttribute('status')).toBe('success');
    expect(region.querySelector('sky-badge')?.textContent).toBe(t.statuses.CONFIRMED);
    expect(region.textContent).not.toContain(ORDER.id);
  });

  it('shows every line with its own image, member and a new-tab link to its detail page', () => {
    renderCard();
    const lines = Array.from(document.querySelectorAll('li.purchase-line'));
    expect(lines).toHaveLength(3);
    expect(lines[0].querySelector('img')?.getAttribute('src')).toBe('https://img.test/serum.jpg');
    expect(lines[1].querySelector('img')?.getAttribute('src')).toBe('https://img.test/sauna.jpg');
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining('Vitality Wellness & Beauty'),
      expect.stringContaining('UrbanGlow Beauty & Care · Connaught Place'),
      expect.stringContaining('GlowNest Wellness Studio'),
    ]);
    const serumLink = screen.getByRole('link', { name: /Eyelash Conditioning Serum/ });
    expect(serumLink.getAttribute('href')).toBe('/products/p1');
    expect(serumLink.getAttribute('target')).toBe('_blank');
    expect(serumLink.getAttribute('rel')).toContain('noopener');
  });

  it('shows the order total and opens the order from View details', () => {
    const onViewDetails = renderCard();
    expect(document.querySelector('.summary-panel__total')?.textContent).toContain('₹5,278');
    expect(document.querySelector('.summary-panel__meta')?.textContent).toContain(t.itemCountMany.replace('{count}', '3'));
    fireEvent.click(screen.getByText(t.viewDetails));
    expect(onViewDetails).toHaveBeenCalledWith(ORDER);
  });

  it('marks a cancelled order with the error status', () => {
    render(
      <MemoryRouter>
        <CustomerOrderCard order={{ ...ORDER, status: 'CANCELLED' }} onViewDetails={vi.fn()} />
      </MemoryRouter>,
    );
    expect(document.querySelector('sky-badge')?.getAttribute('status')).toBe('error');
  });
});
