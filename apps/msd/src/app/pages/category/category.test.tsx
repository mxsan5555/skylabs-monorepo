import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CatalogCategoryWithChildren } from '../../../api/catalog';
import type { CatalogShellValue } from '../../../catalog/catalog-shell';
import content from '../../../content.json';
import { Category } from './category';
import { PrerenderDataProvider, categoryDataKey, type PrerenderPayload } from '../../../prerender-data/prerender-data';
import { ToastProvider } from '../../../toast/toast-context';
import { ApiRequestError } from '../../../api/rbac/client';

const {
  getCatalogCategoryMock,
  listCatalogDealsMock,
  listCatalogProductsMock,
  listCatalogTherapistsMock,
  getCatalogDealFacetsMock,
  shellState,
  defaultShell,
  VENDOR_A,
  BRANCH_A,
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
    getCatalogDealFacetsMock: vi.fn(),
    VENDOR_A: '11111111-1111-4111-8111-111111111111',
    BRANCH_A: '22222222-2222-4222-8222-222222222222',
  };
});

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    getCatalogCategory: (...args: unknown[]) => getCatalogCategoryMock(...args),
    listCatalogDeals: (...args: unknown[]) => listCatalogDealsMock(...args),
    listCatalogProducts: (...args: unknown[]) => listCatalogProductsMock(...args),
    listCatalogTherapists: (...args: unknown[]) => listCatalogTherapistsMock(...args),
    getCatalogDealFacets: (...args: unknown[]) => getCatalogDealFacetsMock(...args),
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
const visitor = vi.hoisted(() => ({
  value: {
    status: 'none' as 'none' | 'locating' | 'ready',
    source: 'none' as 'none' | 'saved' | 'browser' | 'ip',
    city: null as string | null,
    state: null as string | null,
    coords: null as { latitude: number; longitude: number } | null,
  },
}));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({ ...visitor.value, setCity: vi.fn(), requestBrowser: vi.fn() }),
}));
vi.mock('../../components/deal-map/deal-map', () => ({
  DealMap: ({ points }: { points: unknown[] }) => <div data-testid="deal-map">{points.length}</div>,
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
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/category/:slug" element={<><Category /><LocationBar /></>} />
          <Route path="/category/:slug/:city" element={<><Category /><LocationBar /></>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');

const lastSubcategoryId = () => listCatalogDealsMock.mock.calls.at(-1)?.[0]?.subcategoryId;

type Chip = HTMLElement & { label?: string; selected?: boolean };
const chip = (label: string) =>
  (Array.from(document.querySelectorAll('md-filter-chip')) as Chip[]).find((c) => (c.label ?? c.getAttribute('label')) === label) as Chip;
const isSelected = (c: Chip) => c.selected ?? c.hasAttribute('selected');

const FACETS_DEFAULT = {
  vendors: [{ id: VENDOR_A, name: 'Glow', count: 2 }],
  branches: [{ id: BRANCH_A, name: 'Main', city: 'Pune', vendorName: 'Glow', count: 2 }],
  distance: [] as { km: number; count: number }[],
  price: { min: 299, max: 3499 },
};

function stubMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

/** Finds a `md-checkbox`/`md-radio` by its adjacent option-row label text (as `CheckboxFacet` and
 *  the distance list render each option: a raw M3 control + a `.checkbox-facet__label` span). */
function controlByLabel(tag: string, label: string): (HTMLElement & { checked?: boolean; value?: string }) | undefined {
  const span = Array.from(document.querySelectorAll('.checkbox-facet__label')).find((s) => s.textContent === label);
  return (span?.closest('label')?.querySelector(tag) ?? undefined) as (HTMLElement & { checked?: boolean; value?: string }) | undefined;
}

/** Same as `controlByLabel`, but throws instead of returning `undefined` — for call sites that
 *  already awaited the control's presence and just want it without a non-null assertion. */
function requireControl(tag: string, label: string): HTMLElement & { checked?: boolean; value?: string } {
  const el = controlByLabel(tag, label);
  if (!el) throw new Error(`No <${tag}> found for label "${label}"`);
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
  listCatalogDealsMock.mockResolvedValue({ data: [] });
  listCatalogProductsMock.mockResolvedValue({ data: [] });
  listCatalogTherapistsMock.mockResolvedValue({ data: [] });
  getCatalogDealFacetsMock.mockResolvedValue({ data: FACETS_DEFAULT });
  shellState.value = defaultShell;
  visitor.value = { status: 'none', source: 'none', city: null, state: null, coords: null };
});

afterEach(() => vi.unstubAllGlobals());

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
    await waitFor(() => expect(chip('Swedish')).toBeTruthy());

    fireEvent.click(chip('Swedish'));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sub=swedish'));
    await waitFor(() => expect(lastSubcategoryId()).toBe('s1'));

    fireEvent.click(chip(content.category.tabs.all));
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

  it('waits for cities before fetching city deals, showing the loading state without Seo', async () => {
    // Categories are ready; only the locations fetch is outstanding.
    shellState.value = { ...shellState.value, locationsStatus: 'loading', locations: [] };
    renderAt('/category/massage/pune');
    await waitFor(() => expect(getCatalogCategoryMock).toHaveBeenCalled());
    // Let the category resolve and the deals effect run before asserting.
    await act(async () => {
      await Promise.resolve();
    });
    expect(await screen.findByText(content.category.loading)).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(canonical()).toBeUndefined();
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

describe('Category page with prerendered data', () => {
  const DEAL = {
    id: 'd1',
    title: 'Swedish 60',
    slug: 'swedish-60',
    originalPrice: '1000',
    salePrice: '800',
    discountPercent: 20,
    durationMinutes: 60,
    images: [],
    packages: [],
    vendor: null,
    branch: null,
    category: null,
    subcategory: null,
  };
  const renderWith = (path: string, payload: PrerenderPayload) =>
    render(
      <PrerenderDataProvider payload={payload}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/category/:slug" element={<Category />} />
              <Route path="/category/:slug/:city" element={<Category />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </PrerenderDataProvider>,
    );
  const countText = () =>
    document.getElementById('category-heading')?.closest('.section-head')?.querySelector('[aria-live]')?.textContent;

  it('renders the prerendered category and deals first, then refreshes both once in the background', async () => {
    let resolveCategory!: (v: { data: CatalogCategoryWithChildren }) => void;
    let resolveDeals!: (v: { data: (typeof DEAL)[] }) => void;
    getCatalogCategoryMock.mockImplementation(() => new Promise((r) => { resolveCategory = r; }));
    listCatalogDealsMock.mockImplementation(() => new Promise((r) => { resolveDeals = r; }));
    renderWith('/category/massage', { [categoryDataKey('massage')]: { category: CATEGORY, deals: [DEAL] } });
    // Payload on screen, no loading state, while the refresh is in flight.
    expect(screen.getByRole('heading', { level: 1, name: 'Massage' })).toBeTruthy();
    expect(countText()).toBe(`1 ${content.category.dealCount.singular}`);
    expect(getCatalogCategoryMock).toHaveBeenCalledTimes(1);
    expect(listCatalogDealsMock).toHaveBeenCalledTimes(1);
    expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c1', pageSize: 12 }));
    expect(lastSubcategoryId()).toBeUndefined();
    await act(async () => {
      resolveCategory({ data: { ...CATEGORY, name: 'Massage Therapy' } });
      resolveDeals({ data: [DEAL, { ...DEAL, id: 'd2', title: 'Thai 90' }] });
    });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Massage Therapy' })).toBeTruthy());
    expect(countText()).toBe(`2 ${content.category.dealCount.plural}`);
    // The refreshed category object must not trigger a second deals fetch.
    expect(getCatalogCategoryMock).toHaveBeenCalledTimes(1);
    expect(listCatalogDealsMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the prerendered data when the refresh fails', async () => {
    getCatalogCategoryMock.mockRejectedValue(new Error('down'));
    listCatalogDealsMock.mockRejectedValue(new Error('down'));
    renderWith('/category/massage', { [categoryDataKey('massage')]: { category: CATEGORY, deals: [DEAL] } });
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { level: 1, name: 'Massage' })).toBeTruthy();
    expect(countText()).toBe(`1 ${content.category.dealCount.singular}`);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keys a city page by the resolved city name and refreshes that city', async () => {
    renderWith('/category/massage/pune', { [categoryDataKey('massage', 'Pune')]: { category: CATEGORY, deals: [] } });
    expect(screen.getByRole('heading', { level: 1, name: 'Massage in Pune' })).toBeTruthy();
    expect(countText()).toBe(`0 ${content.category.dealCount.plural}`);
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalledTimes(1));
    expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ city: 'Pune', state: 'Maharashtra' }));
  });

  it('still fetches when the payload is for another slug or city', async () => {
    renderWith('/category/massage/pune', { [categoryDataKey('massage')]: { category: CATEGORY, deals: [] } });
    await waitFor(() => expect(getCatalogCategoryMock).toHaveBeenCalledWith('massage'));
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ city: 'Pune' })));
  });

  it('still fetches the subcategory list when ?sub= is set', async () => {
    renderWith('/category/massage?sub=swedish', { [categoryDataKey('massage')]: { category: CATEGORY, deals: [] } });
    await waitFor(() => expect(lastSubcategoryId()).toBe('s1'));
    expect(getCatalogCategoryMock).toHaveBeenCalledTimes(1);
  });

  it('a prerendered 404 renders not found on the first render', async () => {
    getCatalogCategoryMock.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Not found', 404));
    renderWith('/category/nope', { [categoryDataKey('nope')]: { category: null, deals: [] } });
    expect(document.querySelector('sky-info-card')).toBeTruthy();
    await waitFor(() => expect(getCatalogCategoryMock).toHaveBeenCalledTimes(1));
    expect(document.querySelector('sky-info-card')).toBeTruthy();
  });
});

describe('Category page layout', () => {
  it('renders subcategory pills with the active one selected', async () => {
    renderAt('/category/massage?sub=swedish');
    await waitFor(() => expect(document.querySelectorAll('md-filter-chip')).toHaveLength(3));
    expect(document.querySelector('md-chip-set')?.getAttribute('aria-label')).toBe(content.category.pills.label);
    expect(isSelected(chip('Swedish'))).toBe(true);
    expect(isSelected(chip(content.category.tabs.all))).toBe(false);
  });

  it('has no search field and no city chip in the toolbar', async () => {
    renderAt('/category/massage');
    const toolbar = await screen.findByRole('group', { name: content.category.toolbar.label });
    expect(toolbar.querySelector('sky-action-field')).toBeNull();
    expect(screen.queryByText('All cities')).toBeNull();
  });

  it('announces the result count from content', async () => {
    renderAt('/category/massage');
    expect(await screen.findByText(`0 ${content.category.dealCount.plural}`)).toBeTruthy();
  });

  it('sorts by price and sends the API sort', async () => {
    renderAt('/category/massage');
    await screen.findByRole('group', { name: content.category.toolbar.label });
    const trigger = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent?.includes('Sort:')) as HTMLElement;
    fireEvent.click(trigger);
    expect(screen.queryByText('Distance: Nearest')).toBeNull(); // no coordinates yet
    fireEvent.click(screen.getByText('Price: Low to High'));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sort=price_asc'));
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.sort).toBe('price_asc'));
  });

  it('offers distance sort once the visitor has coordinates and sends them', async () => {
    visitor.value = { ...visitor.value, status: 'ready', city: 'Gorakhpur', coords: { latitude: 26.76, longitude: 83.37 } };
    renderAt('/category/massage');
    await waitFor(() =>
      expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ latitude: 26.76, longitude: 83.37 })),
    );
    const trigger = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent?.includes('Sort:')) as HTMLElement;
    fireEvent.click(trigger);
    expect(screen.getByText('Distance: Nearest')).toBeTruthy();
  });

  const deal = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      id,
      title: `Deal ${id}`,
      salePrice: '999',
      originalPrice: null,
      discountPercent: null,
      durationMinutes: null,
      vendor: null,
      branch: { id: 'b1', name: 'Main', city: 'Pune', address: null, latitude: null, longitude: null },
      mediaImages: [],
      popularTags: [],
      ...extra,
    }) as unknown;

  it('loads 12 at a time and shows the API total', async () => {
    const first = Array.from({ length: 12 }, (_, i) => deal(`d${i}`));
    listCatalogDealsMock.mockImplementation((opts: { page?: number }) =>
      Promise.resolve(opts.page === 2 ? { data: [deal('d12')], meta: { total: 13 } } : { data: first, meta: { total: 13 } }),
    );
    renderAt('/category/massage');
    expect(await screen.findByText(`13 ${content.category.dealCount.plural}`)).toBeTruthy();
    expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ page: 1, pageSize: 12 }));
    expect(screen.getByText('Showing 12 of 13')).toBeTruthy();
    const more = Array.from(document.querySelectorAll('md-outlined-button')).find((b) => b.textContent === content.category.loadMore.button) as HTMLElement;
    fireEvent.click(more);
    await waitFor(() => expect(screen.getByText('Showing 13 of 13')).toBeTruthy());
    expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ page: 2 }));
  });

  it('uses the therapist empty copy from content', async () => {
    getCatalogCategoryMock.mockResolvedValue({ data: { ...CATEGORY, type: 'THERAPY' } });
    renderAt('/category/massage');
    await waitFor(() => {
      const card = document.querySelector('sky-info-card') as (HTMLElement & { heading?: string }) | null;
      expect(card?.getAttribute('heading') ?? card?.heading).toBe(content.category.emptyTherapists.heading);
    });
    expect(await screen.findByText(`0 ${content.category.resultCount.therapist.plural}`)).toBeTruthy();
  });

  describe('filter side panel', () => {
    it('desktop: shows the panel open by default; the Filters button toggles Hide/Show filters', async () => {
      stubMedia(true);
      renderAt('/category/massage');
      await screen.findByRole('group', { name: content.category.toolbar.label });
      expect(await screen.findByRole('complementary', { name: content.category.filterPanel.title })).toBeTruthy();
      const toggle = () =>
        Array.from(document.querySelectorAll('md-text-button')).find(
          (b) => b.textContent?.includes(content.category.toolbar.hideFilters) || b.textContent?.includes(content.category.toolbar.showFilters),
        ) as HTMLElement;
      expect(toggle().textContent).toContain(content.category.toolbar.hideFilters);

      fireEvent.click(toggle());
      expect(screen.queryByRole('complementary', { name: content.category.filterPanel.title })).toBeNull();
      expect(toggle().textContent).toContain(content.category.toolbar.showFilters);

      fireEvent.click(toggle());
      expect(await screen.findByRole('complementary', { name: content.category.filterPanel.title })).toBeTruthy();
      expect(toggle().textContent).toContain(content.category.toolbar.hideFilters);
    });

    it('ticking a business checkbox sets ?vendor= and sends vendorIds to both the deals and facets calls', async () => {
      stubMedia(true);
      renderAt('/category/massage');
      await waitFor(() => expect(controlByLabel('md-checkbox', 'Glow')).toBeTruthy());
      const checkbox = requireControl('md-checkbox', 'Glow');
      checkbox.checked = true;
      fireEvent.change(checkbox);
      await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe(`/category/massage?vendor=${VENDOR_A}`));
      await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.vendorIds).toEqual([VENDOR_A]));
      await waitFor(() => expect(getCatalogDealFacetsMock.mock.calls.at(-1)?.[0]?.vendorIds).toEqual([VENDOR_A]));
    });

    it('ticking a branch checkbox sets ?branch= and sends branchIds', async () => {
      stubMedia(true);
      renderAt('/category/massage');
      await waitFor(() => expect(controlByLabel('md-checkbox', 'Main, Pune')).toBeTruthy());
      const checkbox = requireControl('md-checkbox', 'Main, Pune');
      checkbox.checked = true;
      fireEvent.change(checkbox);
      await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe(`/category/massage?branch=${BRANCH_A}`));
      await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.branchIds).toEqual([BRANCH_A]));
    });

    it('ignores a radius that is not one of the offered distances', async () => {
      stubMedia(true);
      visitor.value = { ...visitor.value, status: 'ready', city: 'Gorakhpur', coords: { latitude: 26.76, longitude: 83.37 } };
      renderAt('/category/massage?radius=600');
      await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
      expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.radiusKm).toBeUndefined();
    });

    it('treats ?sort=distance without coordinates as relevance', async () => {
      stubMedia(true);
      renderAt('/category/massage?sort=distance');
      await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
      expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.sort).toBeUndefined();
    });

    it('picking a distance radio sets ?radius= and sends radiusKm, with visitor coordinates', async () => {
      stubMedia(true);
      visitor.value = { ...visitor.value, status: 'ready', city: 'Gorakhpur', coords: { latitude: 26.76, longitude: 83.37 } };
      getCatalogDealFacetsMock.mockResolvedValue({ data: { ...FACETS_DEFAULT, distance: [{ km: 5, count: 3 }] } });
      renderAt('/category/massage');
      const label = content.category.filterPanel.distance.within.replace('{km}', '5');
      await waitFor(() => expect(controlByLabel('md-radio', label)).toBeTruthy());
      fireEvent.change(requireControl('md-radio', label));
      await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?radius=5'));
      await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.radiusKm).toBe(5));
    });

    it('changing the price slider sets ?min= and ?max=', async () => {
      stubMedia(true);
      renderAt('/category/massage');
      await waitFor(() => expect(document.querySelector('md-slider')).toBeTruthy());
      const slider = document.querySelector('md-slider') as HTMLElement & { valueStart: number; valueEnd: number };
      slider.valueStart = 500;
      slider.valueEnd = 2000;
      fireEvent.change(slider);
      await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?min=500&max=2000'));
      await waitFor(() =>
        expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ minPrice: 500, maxPrice: 2000 })),
      );
    });

    it('Clear all removes radius, min, max, vendor and branch from the URL', async () => {
      stubMedia(true);
      visitor.value = { ...visitor.value, status: 'ready', city: 'Gorakhpur', coords: { latitude: 26.76, longitude: 83.37 } };
      renderAt(`/category/massage?radius=5&min=500&max=2000&vendor=${VENDOR_A}&branch=${BRANCH_A}`);
      await screen.findByRole('group', { name: content.category.toolbar.label });
      const clearAll = Array.from(document.querySelectorAll('md-text-button')).find(
        (b) => b.textContent === content.category.filterPanel.clearAll,
      ) as HTMLElement;
      fireEvent.click(clearAll);
      await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage'));
    });

    it('phone: panel closed by default; the Filters button opens it as a dialog', async () => {
      stubMedia(false);
      renderAt('/category/massage');
      await screen.findByRole('group', { name: content.category.toolbar.label });
      expect(screen.queryByRole('complementary', { name: content.category.filterPanel.title })).toBeNull();
      expect(screen.queryByRole('dialog', { name: content.category.filterPanel.title })).toBeNull();
      const filtersButton = Array.from(document.querySelectorAll('md-text-button')).find((b) =>
        b.textContent?.includes(content.category.toolbar.filters),
      ) as HTMLElement;
      fireEvent.click(filtersButton);
      expect(await screen.findByRole('dialog', { name: content.category.filterPanel.title })).toBeTruthy();
    });

    it('product category: does not request facets; the panel shows only Price', async () => {
      stubMedia(true);
      getCatalogCategoryMock.mockResolvedValue({ data: { ...CATEGORY, type: 'PRODUCT' } });
      renderAt('/category/massage');
      await waitFor(() => expect(listCatalogProductsMock).toHaveBeenCalled());
      const aside = await screen.findByRole('complementary', { name: content.category.filterPanel.title });
      const sections = Array.from(aside.querySelectorAll('sky-accordion-item')) as (HTMLElement & { header?: string })[];
      expect(sections.map((s) => s.header ?? s.getAttribute('header'))).toEqual([content.category.filterPanel.price.title]);
      expect(getCatalogDealFacetsMock).not.toHaveBeenCalled();
    });
  });

  it('switches between list, grid and map views', async () => {
    listCatalogDealsMock.mockResolvedValue({
      data: [
        deal('d1', { branch: { id: 'b1', name: 'Main', city: 'Pune', address: null, latitude: '18.52', longitude: '73.85' } }),
        deal('d2'),
      ],
      meta: { total: 2 },
    });
    renderAt('/category/massage');
    const group = await screen.findByRole('group', { name: content.category.view.label });
    // The map option only appears once the deals (with their coordinates) have loaded.
    await waitFor(() => expect(group.querySelectorAll('md-icon-button')).toHaveLength(3));
    const [list, , map] = Array.from(group.querySelectorAll('md-icon-button')) as HTMLElement[];
    fireEvent.click(list);
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?view=list'));
    expect(document.querySelector('.card-grid__list--list')).toBeTruthy();
    fireEvent.click(map);
    expect((await screen.findByTestId('deal-map')).textContent).toBe('1');
    expect(screen.getByText(content.category.map.missingOne)).toBeTruthy();
  });
});
