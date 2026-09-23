import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { SiteHeader } from './site-header';

const { setCity, shell } = vi.hoisted(() => ({
  setCity: vi.fn(),
  shell: { locations: [] as Array<{ state: string; city: string }> },
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null, bootstrap: null, signOut: vi.fn() }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ ids: new Set(['a', 'b']) }) }));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 1 }));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => ({
    status: 'ready',
    locations: shell.locations,
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
    state: 'Maharashtra',
    coords: null,
    setCity,
    requestBrowser: vi.fn(),
  }),
}));

const renderHeader = () =>
  render(
    <MemoryRouter>
      <SiteHeader />
      <Link to="/elsewhere">Elsewhere</Link>
      <button type="button">Outside</button>
    </MemoryRouter>,
  );

const openPanel = () => {
  const button = screen.getByRole('button', { name: /All categories/ });
  fireEvent.click(button);
  const panel = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement;
  expect(panel.hidden).toBe(false);
  return { button, panel };
};

beforeEach(() => {
  shell.locations = [{ state: 'Maharashtra', city: 'Pune' }];
  setCity.mockClear();
});

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

  it('closes the mega panel when focus leaves the nav, without moving focus', () => {
    renderHeader();
    const { button, panel } = openPanel();
    const link = within(panel).getByRole('link', { name: 'Swedish' });
    act(() => link.focus());
    const outside = screen.getByRole('button', { name: 'Outside' });
    act(() => outside.focus());
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(outside);
  });

  it('keeps the mega panel open while focus moves within the nav', () => {
    renderHeader();
    const { button, panel } = openPanel();
    act(() => button.focus());
    act(() => within(panel).getByRole('link', { name: 'Swedish' }).focus());
    expect(panel.hidden).toBe(false);
  });

  it('closes the mega panel on an outside pointerdown without moving focus', () => {
    renderHeader();
    const { button, panel } = openPanel();
    const focusedBefore = document.activeElement;
    fireEvent.pointerDown(document.body);
    expect(panel.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(focusedBefore);
    expect(document.activeElement).not.toBe(button);
  });

  it('closes the mega panel on route change', () => {
    renderHeader();
    const { panel } = openPanel();
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(panel.hidden).toBe(true);
  });

  // Material icon buttons keep their button/link role inside shadow DOM, so testing-library's
  // role queries cannot see them; query the host's aria-label instead.
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

  it('marks only the current state and city as current in the city dialog', () => {
    shell.locations = [
      { state: 'Maharashtra', city: 'Pune' },
      { state: 'Other', city: 'Pune' },
    ];
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Change city: Pune' }));
    const options = within(screen.getByRole('list', { name: 'Cities with partner spas' })).getAllByRole('button');
    expect(options.map((o) => o.getAttribute('aria-current'))).toEqual(['true', null]);
  });
});
