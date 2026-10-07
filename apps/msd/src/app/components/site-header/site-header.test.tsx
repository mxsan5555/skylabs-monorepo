import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
// Registers `<sky-action-field>` (and every other `sky-*`/`md-*` element) as a custom element —
// site-header.tsx uses the raw tag directly, so unlike header-actions.tsx's `@skylabs-monorepo/
// shared-ui/react` wrapper import, nothing else in this file's module graph triggers that
// registration, and the field's shadow DOM (incl. its `<input>`) would never render without it.
import '@skylabs-monorepo/shared-ui';
import { SiteHeader } from './site-header';

const { setCity, shell, listCatalogDealsMock, listCatalogProductsMock, listCatalogTherapistsMock } = vi.hoisted(() => ({
  setCity: vi.fn(),
  shell: {
    locations: [] as Array<{ state: string; city: string }>,
    categories: [] as Array<{ id: string; name: string; slug: string; description: null; children: Array<{ id: string; name: string; slug: string; description: null }> }>,
    links: [] as Array<{ id: string; label: string; to: string }>,
  },
  listCatalogDealsMock: vi.fn(),
  listCatalogProductsMock: vi.fn(),
  listCatalogTherapistsMock: vi.fn(),
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null, bootstrap: null, signOut: vi.fn() }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({
    ids: new Set(['a', 'b']),
    productIds: new Set(['product-1']),
    itemCount: 3,
  }),
}));
vi.mock('../../../hooks/use-cart-count', () => ({ useCartCount: () => 1 }));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => ({
    status: 'ready',
    locations: shell.locations,
    categories: shell.categories,
  }),
  useCategoryLinks: () => shell.links,
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
vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  listCatalogDeals: (...args: unknown[]) => listCatalogDealsMock(...args),
  listCatalogProducts: (...args: unknown[]) => listCatalogProductsMock(...args),
  listCatalogTherapists: (...args: unknown[]) => listCatalogTherapistsMock(...args),
}));

/** Renders the current router location as plain text, so navigation from a suggestion click or
 *  keyboard Enter can be asserted the same reliable way `search.test.tsx` does. */
function LocationBar() {
  const location = useLocation();
  return <div data-testid="location-bar">{location.pathname}{location.search}</div>;
}
const currentUrl = () => screen.getByTestId('location-bar').textContent ?? '';

const searchField = () =>
  document.querySelector('sky-action-field.site-header__search') as HTMLElement & { updateComplete: Promise<boolean>; value: string };
const searchInput = () => searchField().shadowRoot?.querySelector('input') as HTMLInputElement;
/** Lit renders the field's shadow DOM (incl. its `<input>`) asynchronously on connect, so the
 *  first interaction in a test must wait for `updateComplete` before the shadow input exists. */
async function typeQuery(value: string) {
  await act(async () => {
    await searchField().updateComplete;
  });
  // The `input` listener is attached with a plain `addEventListener` (see site-header.tsx's doc
  // comment on why), not React's synthetic event system, so its `setQuery`/`setOpen` calls need
  // an explicit `act` to flush — including the search-suggestions hook's own follow-on render
  // (its synchronous category match runs in a `useEffect`, one render behind the `input` handler).
  act(() => {
    const input = searchInput();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  });
}
function pressKey(key: string) {
  act(() => {
    searchInput().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
  });
}

const renderHeader = () =>
  render(
    <MemoryRouter>
      <SiteHeader />
      <LocationBar />
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
  shell.categories = [
    {
      id: 'c1',
      name: 'Massage',
      slug: 'massage',
      description: null,
      children: [{ id: 's1', name: 'Swedish', slug: 'swedish', description: null }],
    },
  ];
  shell.links = [{ id: 'c1', label: 'Massage', to: '/category/massage' }];
  setCity.mockClear();
  listCatalogDealsMock.mockReset().mockResolvedValue({ data: [] });
  listCatalogProductsMock.mockReset().mockResolvedValue({ data: [] });
  listCatalogTherapistsMock.mockReset().mockResolvedValue({ data: [] });
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

  it('lists the fallback category links in the mega panel while categories are unavailable', () => {
    shell.categories = [];
    shell.links = [
      { id: '/category/massage', label: 'Massage', to: '/category/massage' },
      { id: '/category/spa', label: 'Spa', to: '/category/spa' },
    ];
    renderHeader();
    const { panel } = openPanel();
    const links = within(panel).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Massage', '/category/massage'],
      ['Spa', '/category/spa'],
    ]);
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
    expect(document.querySelector('[aria-label="Wishlist, 3 items"]')).toBeTruthy();
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

/** Finds a suggestion option by its (possibly concatenated label + sublabel) text content,
 *  rather than an exact accessible-name match, since the label/sublabel are separate <span>s. */
function suggestionOption(text: string): HTMLElement {
  const options = within(screen.getByRole('listbox')).getAllByRole('option');
  const option = options.find((o) => o.textContent?.includes(text));
  if (!option) throw new Error(`suggestion option "${text}" not found`);
  return option;
}

describe('SiteHeader — search suggestions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no dropdown below the minimum query length, without calling the catalog APIs', async () => {
    renderHeader();
    await typeQuery('m');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(listCatalogDealsMock).not.toHaveBeenCalled();
  });

  it('matches categories/subcategories synchronously, before the debounced deal/product/therapist fetch has even fired', async () => {
    renderHeader();
    await typeQuery('swed');
    // The synchronous category match already produced a result, so the loading status text is
    // suppressed (only shown while there are zero results so far) — see search-suggestions.tsx.
    expect(suggestionOption('Swedish')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(listCatalogDealsMock).not.toHaveBeenCalled();
  });

  it('renders deals/products/therapists once the debounced fetch resolves, filtered by the visitor location', async () => {
    listCatalogDealsMock.mockResolvedValue({
      data: [{ id: 'd1', title: 'Hot Stone Massage', category: null, branch: { city: 'Pune' } }],
    });
    renderHeader();
    await typeQuery('massage');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(suggestionOption('Hot Stone Massage')).toBeTruthy();
    expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'massage', city: 'Pune', state: 'Maharashtra' }));
  });

  it('reports no results once every source settles empty', async () => {
    renderHeader();
    await typeQuery('zzz-no-match');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole('status')).toHaveTextContent('No results found');
  });

  it('selecting a suggestion by click navigates to it, clears the field, and closes the dropdown', async () => {
    renderHeader();
    await typeQuery('swed');
    fireEvent.click(suggestionOption('Swedish'));
    expect(currentUrl()).toBe('/category/massage?sub=swedish');
    expect(screen.queryByRole('listbox')).toBeNull();
    // Checked on the host's reactive `value` property (updated synchronously by selectItem),
    // not the shadow `<input>`'s DOM value, which only catches up once Lit's own async render
    // of the `live(this.value)`-bound input runs.
    expect(searchField().value).toBe('');
  });

  it('ArrowDown moves the active descendant through the suggestions and Enter navigates to it', async () => {
    renderHeader();
    await typeQuery('swed');
    const option = suggestionOption('Swedish');
    expect(option.getAttribute('aria-selected')).toBe('false');

    pressKey('ArrowDown');
    expect(option.getAttribute('aria-selected')).toBe('true');
    expect(searchField().getAttribute('aria-activedescendant')).toBe(option.id);

    pressKey('Enter');
    expect(currentUrl()).toBe('/category/massage?sub=swedish');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ArrowUp wraps to the last suggestion when nothing is active yet', async () => {
    renderHeader();
    await typeQuery('swed');
    pressKey('ArrowUp');
    expect(suggestionOption('Swedish').getAttribute('aria-selected')).toBe('true');
  });

  it('closes the dropdown on route change, e.g. after clicking an unrelated link', async () => {
    renderHeader();
    await typeQuery('swed');
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes the dropdown on Escape without submitting a navigation', async () => {
    renderHeader();
    await typeQuery('swed');
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(currentUrl()).toBe('/');
  });

  it('submitting the field directly (sky-submit) navigates to /explore with the query, closing the dropdown', async () => {
    renderHeader();
    await typeQuery('swed');
    fireEvent(searchField(), new CustomEvent('sky-submit', { detail: { value: 'swed' } }));
    expect(currentUrl()).toBe('/explore?q=swed');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
