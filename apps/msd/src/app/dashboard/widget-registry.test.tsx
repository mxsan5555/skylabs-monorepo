import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY } from './widget-registry';
import type { DashboardStats } from '../../api/rbac/dashboard';

/**
 * WIDGET_REGISTRY is a plain lookup map keyed by `WidgetConfig.key`; the "unknown
 * key renders nothing" contract actually lives one level up, in
 * pages/account/dashboard.tsx's `const Widget = WIDGET_REGISTRY[key]; if (!Widget)
 * return null;` — exercised here directly against the registry, since that's the
 * exact lookup pattern the dashboard page uses.
 */
function renderFromRegistry(
  key: string,
  props: { stats?: DashboardStats | null; statsLoading?: boolean; statsError?: string } = {},
) {
  const Widget = WIDGET_REGISTRY[key];
  if (!Widget) return null;
  return <Widget title={`Title for ${key}`} {...props} />;
}

const STATS: DashboardStats = {
  vendors: 7,
  customers: 1284,
  branches: 11,
  categories: 9,
  subCategories: 24,
  products: 18,
  deals: 33,
  orders: 512,
  revenue: '420000',
};

describe('WIDGET_REGISTRY', () => {
  it('maps every documented widget key to a component', () => {
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual([
      'branches-count',
      'categories-count',
      'customers-count',
      'deals-count',
      'orders-recent',
      'products-count',
      'revenue-summary',
      'subcategories-count',
      'vendor-profile',
      'vendors-count',
    ]);
  });

  it('renders a loading state while stats are in flight', () => {
    render(<>{renderFromRegistry('customers-count', { stats: null, statsLoading: true })}</>);
    expect(screen.getByRole('heading', { name: 'Title for customers-count' })).toBeTruthy();
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('renders an error state when the stats fetch failed', () => {
    render(<>{renderFromRegistry('customers-count', { stats: null, statsError: 'Could not load dashboard statistics.' })}</>);
    expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Could not load dashboard statistics.');
  });

  it('renders an empty state when there is no stats data yet', () => {
    render(<>{renderFromRegistry('customers-count', { stats: null })}</>);
    expect(screen.getByText('No data yet.')).toBeTruthy();
  });

  it('renders the real customer count ("customers-count")', () => {
    render(<>{renderFromRegistry('customers-count', { stats: STATS })}</>);
    expect(screen.getByText('1,284')).toBeTruthy();
  });

  it('renders the real order count ("orders-recent")', () => {
    render(<>{renderFromRegistry('orders-recent', { stats: STATS })}</>);
    expect(screen.getByText('512')).toBeTruthy();
  });

  it('renders the real revenue total, formatted as INR ("revenue-summary")', () => {
    render(<>{renderFromRegistry('revenue-summary', { stats: STATS })}</>);
    expect(screen.getByText('₹4,20,000')).toBeTruthy();
  });

  it('renders the real vendor count ("vendors-count")', () => {
    render(<>{renderFromRegistry('vendors-count', { stats: STATS })}</>);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('renders the real branch count ("branches-count")', () => {
    render(<>{renderFromRegistry('branches-count', { stats: STATS })}</>);
    expect(screen.getByText('11')).toBeTruthy();
  });

  it('renders the real category count ("categories-count")', () => {
    render(<>{renderFromRegistry('categories-count', { stats: STATS })}</>);
    expect(screen.getByText('9')).toBeTruthy();
  });

  it('renders the real sub-category count ("subcategories-count")', () => {
    render(<>{renderFromRegistry('subcategories-count', { stats: STATS })}</>);
    expect(screen.getByText('24')).toBeTruthy();
  });

  it('renders the real product count ("products-count")', () => {
    render(<>{renderFromRegistry('products-count', { stats: STATS })}</>);
    expect(screen.getByText('18')).toBeTruthy();
  });

  it('renders the real deals count ("deals-count")', () => {
    render(<>{renderFromRegistry('deals-count', { stats: STATS })}</>);
    expect(screen.getByText('33')).toBeTruthy();
  });

  it('renders the component for a known widget key ("vendor-profile"), linking to /account/vendors', () => {
    render(<MemoryRouter>{renderFromRegistry('vendor-profile')}</MemoryRouter>);
    expect(screen.getByRole('link', { name: /My Business/ })).toHaveProperty('pathname', '/account/vendors');
  });

  // Edge cases
  it('has no entry (undefined) for an unknown widget key', () => {
    expect(WIDGET_REGISTRY['not-a-real-widget']).toBeUndefined();
  });

  it('renders nothing for an unknown widget key, following the dashboard page lookup pattern', () => {
    const { container } = render(<>{renderFromRegistry('not-a-real-widget')}</>);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for an empty-string widget key', () => {
    const { container } = render(<>{renderFromRegistry('')}</>);
    expect(container.innerHTML).toBe('');
  });
});
