import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

type Chip = HTMLElement & { label?: string; selected?: boolean };
const chip = (label: string) =>
  (Array.from(document.querySelectorAll('md-filter-chip')) as Chip[]).find((c) => (c.label ?? c.getAttribute('label')) === label) as Chip;
const isSelected = (c: Chip) => c.selected ?? c.hasAttribute('selected');

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
    expect(listCatalogDealsMock).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'c1', pageSize: 60 }));
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

  it('puts search in the listing toolbar', async () => {
    renderAt('/category/massage');
    const toolbar = await screen.findByRole('group', { name: content.category.toolbar.label });
    expect(toolbar.querySelector('sky-action-field')).toBeTruthy();
  });

  it('searches on sky-submit, not on every keystroke', async () => {
    renderAt('/category/massage');
    await screen.findByRole('heading', { level: 1, name: 'Massage' });
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
    const field = document.querySelector('sky-action-field') as HTMLElement;
    expect(field.getAttribute('role')).toBe('search');
    act(() => {
      field.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'swedish' } }));
    });
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.search).toBe('swedish'));
    // The field shows the active search (it is controlled, so a remount keeps the term visible).
    const shown = document.querySelector('sky-action-field') as HTMLElement & { value?: string };
    expect(shown.getAttribute('value') ?? shown.value).toBe('swedish');
  });

  it('announces the result count from content', async () => {
    renderAt('/category/massage');
    expect(await screen.findByText(`0 ${content.category.dealCount.plural}`)).toBeTruthy();
  });

  it('sorts from the toolbar menu and keeps the choice in ?sort=', async () => {
    renderAt('/category/massage');
    await screen.findByRole('group', { name: content.category.toolbar.label });
    const trigger = Array.from(document.querySelectorAll('md-text-button')).find((b) => b.textContent?.includes('Sort:')) as HTMLElement;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText('Biggest discount'));
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sort=discount'));
    await waitFor(() => expect(listCatalogDealsMock.mock.calls.at(-1)?.[0]?.sort).toBe('discount'));
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
});
