import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import content from '../../../content.json';
import { HeaderActions } from './header-actions';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: true, token: 't', bootstrap: null, signOut: vi.fn() }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ ids: new Set() }) }));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 0 }));

const ui = (
  <MemoryRouter>
    <HeaderActions />
  </MemoryRouter>
);

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
