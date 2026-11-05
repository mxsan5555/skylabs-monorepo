import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MyAccountLayout } from './my-account-layout';

const auth = vi.hoisted(() => ({ bootstrap: null as unknown }));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: true, bootstrap: auth.bootstrap, signOut: vi.fn() }),
}));

const bootstrapWith = (...keys: string[]) => ({
  user: { email: 'user@example.com' },
  roles: keys.map((key) => ({ key })),
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<MyAccountLayout />}>
          <Route path="/my-dashboard" element={<p>Customer dashboard</p>} />
          <Route path="/orders" element={<p>Customer orders</p>} />
        </Route>
        <Route path="/account/dashboard" element={<p>Admin console</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.bootstrap = null;
});

describe('MyAccountLayout role redirect', () => {
  it('sends a super admin opening /my-dashboard to the admin console', () => {
    auth.bootstrap = bootstrapWith('super_admin', 'customer');
    renderAt('/my-dashboard');
    expect(screen.getByText('Admin console')).toBeTruthy();
    expect(screen.queryByText('Customer dashboard')).toBeNull();
  });

  it('sends staff opening any customer account page to the admin console', () => {
    auth.bootstrap = bootstrapWith('admin');
    renderAt('/orders');
    expect(screen.getByText('Admin console')).toBeTruthy();
  });

  it('shows the customer dashboard to a customer', () => {
    auth.bootstrap = bootstrapWith('customer');
    renderAt('/my-dashboard');
    expect(screen.getByText('Customer dashboard')).toBeTruthy();
  });

  it('keeps the customer layout for a customer who is also a member', () => {
    auth.bootstrap = bootstrapWith('customer', 'member');
    renderAt('/my-dashboard');
    expect(screen.getByText('Customer dashboard')).toBeTruthy();
  });
});
