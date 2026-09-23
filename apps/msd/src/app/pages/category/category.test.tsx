import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCategoryWithChildren } from '../../../api/catalog';
import type { CatalogShellValue } from '../../../catalog/catalog-shell';
import content from '../../../content.json';
import { Category } from './category';

const {
  getCatalogCategoryMock,
  listCatalogDealsMock,
  listCatalogProductsMock,
  listCatalogTherapistsMock,
  tabsStub,
  shellState,
  defaultShell,
} = vi.hoisted(() => {
  const defaultShell: CatalogShellValue = {
    status: 'ready',
    locationsStatus: 'ready',
    categories: [],
    socialLinks: [],
    locations: [{ state: 'Maharashtra', city: 'Pune' }],
  };
  return {
    defaultShell,
    shellState: { value: defaultShell },
    getCatalogCategoryMock: vi.fn(),
    listCatalogDealsMock: vi.fn(),
    listCatalogProductsMock: vi.fn(),
    listCatalogTherapistsMock: vi.fn(),
    tabsStub: { onChange: undefined as undefined | ((e: { target: { activeTabIndex: number } }) => void) },
  };
});

vi.mock('@skylabs-monorepo/shared-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@skylabs-monorepo/shared-ui/react')>()),
  Tabs: ({ onChange, children }: { onChange?: typeof tabsStub.onChange; children?: ReactNode }) => {
    tabsStub.onChange = onChange;
    return <div role="tablist">{children}</div>;
  },
}));

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    getCatalogCategory: (...args: unknown[]) => getCatalogCategoryMock(...args),
    listCatalogDeals: (...args: unknown[]) => listCatalogDealsMock(...args),
    listCatalogProducts: (...args: unknown[]) => listCatalogProductsMock(...args),
    listCatalogTherapists: (...args: unknown[]) => listCatalogTherapistsMock(...args),
  };
});
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({ toggle: vi.fn(), has: () => false }),
}));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => shellState.value,
}));
vi.mock('../../seo/site-url', () => ({
  SITE_URL: 'https://example.test',
  absoluteUrl: (path: string) => `https://example.test${path}`,
}));
vi.mock('../../../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({ location: null, coords: null }),
}));

const CATEGORY: CatalogCategoryWithChildren = {
  id: 'c1',
  name: 'Massage',
  slug: 'massage',
  description: null,
  children: [
    { id: 's1', name: 'Swedish', slug: 'swedish', description: null },
    { id: 's2', name: 'Deep Tissue', slug: 'deep-tissue', description: null },
  ],
} as CatalogCategoryWithChildren;

function LocationBar() {
  const location = useLocation();
  return <div data-testid="location-bar">{location.pathname + location.search}</div>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/category/:slug" element={<><Category /><LocationBar /></>} />
        <Route path="/category/:slug/:city" element={<><Category /><LocationBar /></>} />
      </Routes>
    </MemoryRouter>,
  );

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');

const lastSubcategoryId = () => listCatalogDealsMock.mock.calls.at(-1)?.[0]?.subcategoryId;

/** Under vitest, @lit/react resolves to its node build, which never wires element events, so the
 *  Tabs wrapper is swapped for a stub that captures `onChange`; `pickTab` then calls it the way
 *  md-tabs' `change` would. */
function pickTab(index: number) {
  act(() => {
    tabsStub.onChange?.({ target: { activeTabIndex: index } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
  listCatalogDealsMock.mockResolvedValue({ data: [] });
  listCatalogProductsMock.mockResolvedValue({ data: [] });
  listCatalogTherapistsMock.mockResolvedValue({ data: [] });
  shellState.value = defaultShell;
});

describe('Category page ?sub=', () => {
  it('opens on the subcategory named by ?sub=', async () => {
    renderAt('/category/massage?sub=deep-tissue');
    await waitFor(() => expect(lastSubcategoryId()).toBe('s2'));
  });

  it('falls back to "All" for an unknown ?sub= slug', async () => {
    renderAt('/category/massage?sub=nope');
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
    expect(lastSubcategoryId()).toBeUndefined();
  });

  it('writes the picked subcategory to ?sub= and removes it for "All"', async () => {
    renderAt('/category/massage');
    await waitFor(() => expect(screen.getByRole('tablist')).toBeTruthy());

    pickTab(1);
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sub=swedish'));
    await waitFor(() => expect(lastSubcategoryId()).toBe('s1'));

    pickTab(0);
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage'));
    await waitFor(() => expect(lastSubcategoryId()).toBeUndefined());
  });
});

describe('Category page /:city', () => {
  it('city route titles the page "{category} in {city}" and filters deals by that city', async () => {
    getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
    listCatalogDealsMock.mockResolvedValue({ data: [] });
    renderAt('/category/massage/pune');
    expect(await screen.findByRole('heading', { level: 1, name: 'Massage in Pune' })).toBeTruthy();
    await waitFor(() =>
      expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ city: 'Pune', state: 'Maharashtra' })),
    );
    expect(canonical()).toBe('https://example.test/category/massage/pune');
    expect(robots()).toBeUndefined();
  });

  it('unknown city slug renders not found', async () => {
    getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
    listCatalogDealsMock.mockResolvedValue({ data: [] });
    renderAt('/category/massage/atlantis');
    // The heading renders inside sky-info-card's shadow DOM; React 19 sets it as a property on
    // the registered element, so read it off the host.
    await waitFor(() =>
      expect((document.querySelector('sky-info-card') as { heading?: string } | null)?.heading).toBe(
        content.category.notFound.heading,
      ),
    );
    expect(listCatalogDealsMock).not.toHaveBeenCalled();
  });

  it('waits for cities before fetching city deals', async () => {
    // Categories are ready; only the locations fetch is outstanding.
    shellState.value = { ...shellState.value, locationsStatus: 'loading', locations: [] };
    getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
    listCatalogDealsMock.mockResolvedValue({ data: [] });
    renderAt('/category/massage/pune');
    await screen.findByRole('heading', { level: 1, name: 'Massage' });
    // Let the deals effect run before asserting it stayed idle.
    await act(async () => {
      await Promise.resolve();
    });
    expect(listCatalogDealsMock).not.toHaveBeenCalled();
  });

  it('a locations failure renders the plain category page, noindexed, instead of not found', async () => {
    shellState.value = { ...shellState.value, locationsStatus: 'error', locations: [] };
    renderAt('/category/massage/pune');
    expect(await screen.findByRole('heading', { level: 1, name: 'Massage' })).toBeTruthy();
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
    expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.city).toBeUndefined();
    expect(canonical()).toBe('https://example.test/category/massage');
    expect(robots()).toBe('noindex, nofollow');
  });

  it.each([
    ['PRODUCT', listCatalogProductsMock],
    ['THERAPY', listCatalogTherapistsMock],
  ] as const)('a %s category ignores the city: plain page, category canonical, noindex', async (type, listMock) => {
    getCatalogCategoryMock.mockResolvedValue({ data: { ...CATEGORY, type } });
    renderAt('/category/massage/pune');
    expect(await screen.findByRole('heading', { level: 1, name: 'Massage' })).toBeTruthy();
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.queryByText('Pune')).toBeNull();
    expect(document.title).not.toContain('Pune');
    expect(canonical()).toBe('https://example.test/category/massage');
    expect(robots()).toBe('noindex, nofollow');
  });
});
