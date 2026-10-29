import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Feature: `/account/orders/:orderId` route guard — Bug 1 fix
 * Scenario: the guard used to check only `orders:view`, which a plain `vendor` role never holds
 * (only `vendor-portal.orders:*`), so a member's own "View Order" click silently bounced to
 * `/account/profile` even though the backend (`GET /orders/:id`) already scoped the vendor
 * caller correctly. The fix widens the guard to `can('orders','view') || can('vendors','custom')`
 * — this test exercises the REAL guard exported from `routes.tsx`, not a re-implementation of its
 * logic, so it would catch a regression if the OR-condition were ever narrowed again.
 *
 * Given: a caller with some combination of `orders:view` / `vendors:custom`
 * When: they reach the guarded route
 * Then: exactly the OR-gate decides whether the protected content renders or a redirect to
 *       `/account/profile` happens
 *
 * Edge cases:
 * - a caller holding ONLY `vendors:custom` (the member/vendor case the bug was about) must get
 *   through — this is the actual regression case
 * - a caller holding NEITHER permission must be redirected, never rendered
 */
let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

import { OrderDetailRouteGuard } from './routes';

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/account/orders/order-1']}>
      <Routes>
        <Route
          path="/account/orders/:orderId"
          element={
            <OrderDetailRouteGuard>
              <div>Protected Order Detail</div>
            </OrderDetailRouteGuard>
          }
        />
        <Route path="/account/profile" element={<div>Profile Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  grantedPermissions = new Set();
});

describe('OrderDetailRouteGuard', () => {
  it('renders the protected content for a caller holding orders:view (the admin case)', () => {
    grantedPermissions = new Set(['orders:view']);
    renderGuarded();
    expect(screen.getByText('Protected Order Detail')).toBeTruthy();
    expect(screen.queryByText('Profile Page')).toBeNull();
  });

  it('renders the protected content for a caller holding ONLY vendors:custom, never orders:view — the Bug 1 regression case', () => {
    grantedPermissions = new Set(['vendors:custom']);
    renderGuarded();
    expect(screen.getByText('Protected Order Detail')).toBeTruthy();
    expect(screen.queryByText('Profile Page')).toBeNull();
  });

  it('redirects to /account/profile for a caller holding neither permission', () => {
    grantedPermissions = new Set();
    renderGuarded();
    expect(screen.getByText('Profile Page')).toBeTruthy();
    expect(screen.queryByText('Protected Order Detail')).toBeNull();
  });

  it('redirects a caller holding an unrelated permission (e.g. customers:view) — not just "any permission at all"', () => {
    grantedPermissions = new Set(['customers:view']);
    renderGuarded();
    expect(screen.getByText('Profile Page')).toBeTruthy();
  });
});
