import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { SiteHeader } from './site-header';

const { setCity } = vi.hoisted(() => ({ setCity: vi.fn() }));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null, bootstrap: null, signOut: vi.fn() }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ ids: new Set(['a', 'b']) }) }));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 1 }));
vi.mock('../../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({
    status: 'ready',
    locations: [{ state: 'Maharashtra', city: 'Pune' }],
    categories: [
      {
        id: 'c1',
        name: 'Massage',
        slug: 'massage',
        description: null,
        children: [{ id: 's1', name: 'Swedish', slug: 'swedish', description: null }],
      },
    ],
  }),
  useCategoryLinks: () => [{ id: 'c1', label: 'Massage', to: '/category/massage' }],
}));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({
    status: 'ready',
    source: 'ip',
    city: 'Pune',
    coords: null,
    setCity,
    requestBrowser: vi.fn(),
  }),
}));

const renderHeader = () =>
  render(
    <MemoryRouter>
      <SiteHeader />
    </MemoryRouter>,
  );

describe('SiteHeader', () => {
  it('has a skip link to #main-content and a banner landmark', () => {
    renderHeader();
    expect(screen.getByText('Skip to main content').getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('renders category links as plain links inside the categories nav', () => {
    renderHeader();
    const nav = screen.getByRole('navigation', { name: 'Categories' });
    expect(within(nav).getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/category/massage');
  });

  it('toggles the mega panel as a disclosure and closes it with Escape, returning focus', () => {
    renderHeader();
    const button = screen.getByRole('button', { name: /All categories/ });
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(within(panel).getByRole('link', { name: 'Swedish' }).getAttribute('href')).toBe(
      '/category/massage?sub=swedish',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('names counted actions for screen readers', () => {
    renderHeader();
    expect(document.querySelector('[aria-label="Wishlist, 2 items"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Cart, 1 item"]')).toBeTruthy();
  });

  it('shows the resolved city in the city chip', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Change city: Pune' })).toBeTruthy();
  });

  it('opens a city dialog, sets the chosen city and returns focus to the chip', () => {
    renderHeader();
    const chip = screen.getByRole('button', { name: 'Change city: Pune' });
    fireEvent.click(chip);
    const list = screen.getByRole('list', { name: 'Cities with partner spas' });
    fireEvent.click(within(list).getByRole('button', { name: /Pune/ }));
    expect(setCity).toHaveBeenCalledWith({ state: 'Maharashtra', city: 'Pune' });
    expect(document.querySelector('md-dialog')).toBeNull();
    expect(document.activeElement).toBe(chip);
  });
});
