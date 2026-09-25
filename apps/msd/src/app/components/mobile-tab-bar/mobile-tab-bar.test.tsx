import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { MobileTabBar } from './mobile-tab-bar';
import content from '../../../content.json';

type MockSubcategory = { id: string; name: string; slug: string; description: string | null };
type MockCategory = MockSubcategory & { children: MockSubcategory[] };

const state = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  categories: [] as MockCategory[],
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null, bootstrap: null }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ ids: new Set(['a']) }) }));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 0 }));
// `useCategoryLinks` (same module) calls `useCatalogShell` internally, so mocking only
// `useCatalogShell` and importing the real `useCategoryLinks` would read the real (unmocked)
// context instead of this test's `state` — mock both, mirroring `useCategoryLinks`'s own
// categories-present/fallback-to-`content.nav.categories` logic against the same `state`.
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => ({ status: state.status, categories: state.categories, locations: [] }),
  useCategoryLinks: () =>
    state.categories.length > 0
      ? state.categories.map((c) => ({ id: c.id, label: c.name, to: `/category/${c.slug}` }))
      : content.nav.categories.map((c) => ({ id: c.to, label: c.label, to: c.to })),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
    </MemoryRouter>,
  );

beforeEach(() => {
  state.status = 'ready';
  state.categories = [{ id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] }];
});

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
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(button);
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
    expect(document.querySelector('md-dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('shows the flat fallback list when categories are still loading', () => {
    state.status = 'loading';
    state.categories = [];
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Categories' }));
    expect(screen.getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/category/massage');
  });

  it('shows the flat fallback list when the categories fetch errors', () => {
    state.status = 'error';
    state.categories = [];
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Categories' }));
    expect(screen.getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/category/massage');
  });
});
