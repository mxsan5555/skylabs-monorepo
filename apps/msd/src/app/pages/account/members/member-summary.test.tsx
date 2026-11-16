import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { MemberSummary } from './member-summary';

const MEMBER = {
  id: 'm1',
  status: 'ACTIVE',
  statusReason: null,
  _count: { branches: 3, deals: 12, products: 5, therapists: 4 },
  liveCounts: { branches: 2, deals: 9, products: 5, therapists: 3 },
  customerCount: 1,
  orderCount: 12,
  documentsSummary: { complete: false, dueAt: '2026-10-30T00:00:00Z', overdue: false, missing: ['PAN'] },
} as unknown as Vendor;

const ALL_TABS = ['documents', 'branches', 'deals', 'therapists', 'products', 'customers'];

function renderSummary(member: Vendor = MEMBER, tabs: string[] = ALL_TABS, canOpenOrders = true) {
  render(
    <MemoryRouter>
      <MemberSummary member={member} tabs={tabs} canOpenOrders={canOpenOrders} />
    </MemoryRouter>,
  );
  return within(screen.getByRole('region', { name: 'Overview' }));
}

/** Item 7: the member page opens with dashboard-style cards before the tabs. */
describe('MemberSummary', () => {
  it('shows status, documents, catalog counts with what is live, customers and orders', () => {
    const overview = renderSummary();
    const texts = overview.getAllByRole('listitem').map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(texts).toEqual([
      expect.stringContaining('Active Status'),
      expect.stringContaining('Incomplete Documents Due 30 Oct 2026'),
      expect.stringContaining('3 Branches 2 live'),
      expect.stringContaining('12 Deals 9 live'),
      expect.stringContaining('4 Therapists 3 live'),
      expect.stringContaining('5 Products 5 live'),
      expect.stringContaining('1 Customer'),
      expect.stringContaining('12 Orders'),
    ]);
  });

  it('links each card to its tab, and orders to the filtered order list', () => {
    const overview = renderSummary();
    expect(overview.getByRole('link', { name: /12 Deals/ }).getAttribute('href')).toBe('/account/members/m1/deals');
    expect(overview.getByRole('link', { name: /Documents/ }).getAttribute('href')).toBe('/account/members/m1/documents');
    expect(overview.getByRole('link', { name: /1 Customer/ }).getAttribute('href')).toBe('/account/members/m1/customers');
    expect(overview.getByRole('link', { name: /12 Orders/ }).getAttribute('href')).toBe('/account/orders?vendorId=m1');
    expect(overview.queryByRole('link', { name: /Status/ })).toBeNull();
  });

  it('shows plain numbers where the viewer cannot open the tab or the orders list', () => {
    const overview = renderSummary(MEMBER, ['documents', 'branches', 'deals', 'therapists', 'products'], false);
    expect(overview.getByText('1')).toBeTruthy();
    expect(overview.queryByRole('link', { name: /Customer/ })).toBeNull();
    expect(overview.queryByRole('link', { name: /Orders/ })).toBeNull();
  });

  it('reads complete documents and a suspended status (the page banner gives the reason)', () => {
    const overview = renderSummary({
      ...MEMBER,
      status: 'SUSPENDED',
      statusReason: 'Documents expired',
      documentsSummary: { complete: true, dueAt: null, overdue: false, missing: [] },
    } as unknown as Vendor);
    expect(overview.getByText('Suspended')).toBeTruthy();
    expect(overview.queryByText('Documents expired')).toBeNull();
    expect(overview.getByText('Complete')).toBeTruthy();
  });
});
