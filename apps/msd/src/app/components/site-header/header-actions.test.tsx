import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import content from '../../../content.json';
import { HeaderActions } from './header-actions';

const auth = vi.hoisted(() => ({ bootstrap: null as { roles: { key: string }[] } | null }));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: true, token: 't', bootstrap: auth.bootstrap, signOut: vi.fn() }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({
    ids: new Set(),
    productIds: new Set(),
    itemCount: 0,
  }),
}));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 0 }));

const ui = (
  <MemoryRouter>
    <HeaderActions />
  </MemoryRouter>
);

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

beforeEach(() => {
  auth.bootstrap = null;
});

describe('HeaderActions hydration', () => {
  it('renders the signed-out view on the server even when a token exists', () => {
    const html = renderToString(ui);
    expect(html).toContain(content.header.signIn);
    expect(html).not.toContain(content.header.accountMenuLabel);
  });

  it('shows the account menu once the client has taken over', () => {
    const { container } = render(ui);
    expect(container.querySelector(`[aria-label="${content.header.accountMenuLabel}"]`)).not.toBeNull();
    expect(container.textContent).not.toContain(content.header.signIn);
  });
});

/** ST-01: "Become a Member" opens the public member sign-up page. */
describe('HeaderActions Become a Member link', () => {
  it('opens /become-member', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <HeaderActions />
        <Routes>
          <Route path="*" element={<CurrentPath />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: content.header.becomeMember }));
    expect(screen.getByTestId('path').textContent).toBe('/become-member');
  });

  it('points at a route the app serves with the member sign-up page', () => {
    const routes = readFileSync(join(__dirname, '../../routes.tsx'), 'utf8');
    expect(content.header.becomeMemberTo).toBe('/become-member');
    expect(routes).toContain(`<Route path="${content.header.becomeMemberTo}" element={<BecomeVendor />} />`);
  });
});

describe('HeaderActions profile link', () => {
  const openProfile = (roles: string[]) => {
    auth.bootstrap = { roles: roles.map((key) => ({ key })) };
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<><HeaderActions /><CurrentPath /></>} />
        </Routes>
      </MemoryRouter>,
    );
    const item = screen.getByText(content.header.profileMenu.profile).closest('md-menu-item') as HTMLElement;
    fireEvent.click(item);
    return screen.getByTestId('path').textContent;
  };

  it('sends a super admin to the admin console', () => {
    expect(openProfile(['super_admin', 'customer'])).toBe('/account/dashboard');
  });

  it('sends a member to the admin console', () => {
    expect(openProfile(['member'])).toBe('/account/dashboard');
  });

  it('sends a customer to the customer dashboard', () => {
    expect(openProfile(['customer'])).toBe('/my-dashboard');
  });
});
