import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { MobileTabBar } from './mobile-tab-bar';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null, bootstrap: null }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ ids: new Set(['a']) }) }));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 0 }));
vi.mock('../../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({
    status: 'ready',
    locations: [],
    categories: [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }],
  }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
    </MemoryRouter>,
  );

describe('MobileTabBar', () => {
  it('is a labelled nav with Home, Categories, Wishlist, Cart, Account', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Categories' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Wishlist, 1 item' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Cart' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/sign-in');
  });

  it('marks the current route with aria-current="page"', () => {
    renderAt('/cart');
    expect(screen.getByRole('link', { name: 'Cart' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens the category sheet from the Categories button', () => {
    renderAt('/');
    const button = screen.getByRole('button', { name: 'Categories' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: 'All Massage' }).getAttribute('href')).toBe('/category/massage');
  });

  it('closes the sheet from its close button and returns focus to the Categories button', () => {
    renderAt('/');
    const button = screen.getByRole('button', { name: 'Categories' });
    fireEvent.click(button);
    // `<md-icon-button>`'s Material-internals-assigned role isn't understood by jsdom's
    // accessibility tree (same documented gap as notification-bell.test.tsx's `bellButton`) —
    // query the custom element by tag + aria-label instead.
    const closeButton = document.querySelector('md-icon-button[aria-label="Close navigation"]');
    if (!closeButton) throw new Error('Close navigation button not found');
    fireEvent.click(closeButton);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });
});
