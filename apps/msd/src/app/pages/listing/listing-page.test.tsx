import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCategoryWithChildren } from '../../../api/catalog';
import type { CatalogShellValue } from '../../../catalog/catalog-shell';
import content from '../../../content.json';
import { ListingPage } from './listing-page';
import { PrerenderDataProvider, listingDataKey, type PrerenderPayload } from '../../../prerender-data/prerender-data';

/**
 * ST-42 (TESTING §4.4 "Listing pages"): `/deals`, `/deals/:city`, `/products`, `/therapists`,
 * `/therapists/:city` on the shared listing layout.
 */
const m = vi.hoisted(() => ({
  listDeals: vi.fn(),
  listProducts: vi.fn(),
  listTherapists: vi.fn(),
  dealFacets: vi.fn(),
  productFacets: vi.fn(),
  therapistFacets: vi.fn(),
  shell: { value: null as unknown as CatalogShellValue },
}));

vi.mock('../../../api/catalog', async () => ({
  ...(await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog')),
  listCatalogDeals: (...a: unknown[]) => m.listDeals(...a),
  listCatalogProducts: (...a: unknown[]) => m.listProducts(...a),
  listCatalogTherapists: (...a: unknown[]) => m.listTherapists(...a),
  getCatalogDealFacets: (...a: unknown[]) => m.dealFacets(...a),
  getCatalogProductFacets: (...a: unknown[]) => m.productFacets(...a),
  getCatalogTherapistFacets: (...a: unknown[]) => m.therapistFacets(...a),
}));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => m.shell.value,
}));
vi.mock('../../../location/location-context', () => ({
  useVisitorLocation: () => ({ status: 'none', source: 'none', city: null, state: null, coords: null, setCity: vi.fn(), requestBrowser: vi.fn() }),
}));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ isAuthenticated: false, token: null }) }));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({ toggle: vi.fn(), has: () => false, hasProduct: () => false, toggleProduct: vi.fn(), isProductPending: () => false }),
}));
vi.mock('../../seo/site-url', () => ({ SITE_URL: 'https://example.test', absoluteUrl: (p: string) => `https://example.test${p}` }));
vi.mock('../../components/deal-map/deal-map', () => ({ DealMap: () => <div data-testid="deal-map" /> }));

const OILS_ID = '0a0a0a0a-0000-4000-8000-000000000001';
const CALM_SPA_ID = 'f1f1f1f1-0000-4000-8000-0000000000c5';
const cat = (slug: string, name: string, type: 'SERVICE' | 'PRODUCT' | 'THERAPY') =>
  ({ id: `id-${slug}`, name, slug, description: null, type, children: [] }) as unknown as CatalogCategoryWithChildren;

const DEAL = {
  id: 'd1',
  title: 'Swedish Massage',
  salePrice: '999',
  originalPrice: '1299',
  discountPercent: 23,
  tag: 'hot',
  vendor: { id: 'v1', businessName: 'Glow', slug: 'glow', city: 'Pune', logoUrl: null },
  branch: { id: 'b1', name: 'Main', city: 'Pune', latitude: null, longitude: null },
  packages: [],
};
const PRODUCT = { id: 'p1', name: 'Massage Oil', price: '499', originalPrice: '599', discount: 17, tag: null, vendor: null, image: null };

function LocationBar() {
  const location = useLocation();
  return <div data-testid="location-bar">{location.pathname + location.search}</div>;
}

function renderAt(path: string, payload: PrerenderPayload = {}) {
  const page = (kind: 'deals' | 'products' | 'therapists') => (
    <>
      <ListingPage kind={kind} />
      <LocationBar />
    </>
  );
  return render(
    <PrerenderDataProvider payload={payload}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/deals" element={page('deals')} />
          <Route path="/deals/:city" element={page('deals')} />
          <Route path="/products" element={page('products')} />
          <Route path="/therapists" element={page('therapists')} />
          <Route path="/therapists/:city" element={page('therapists')} />
        </Routes>
      </MemoryRouter>
    </PrerenderDataProvider>,
  );
}

const count = () => document.querySelector('.chip-nav-row__end [aria-live]')?.textContent;
const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute('content');
const panelHeaders = async () => {
  const aside = await screen.findByRole('complementary', { name: content.category.filterPanel.title });
  return Array.from(aside.querySelectorAll('sky-accordion-item')).map((s) => (s as HTMLElement & { header?: string }).header ?? s.getAttribute('header'));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  m.shell.value = {
    status: 'ready',
    locationsStatus: 'ready',
    categories: [cat('massage', 'Massage', 'SERVICE'), cat('oils', 'Oils', 'PRODUCT'), cat('physio', 'Physio', 'THERAPY')],
    socialLinks: [],
    locations: [{ state: 'Maharashtra', city: 'Pune' }],
  } as CatalogShellValue;
  m.listDeals.mockResolvedValue({ data: [DEAL], meta: { total: 25 } });
  m.listProducts.mockResolvedValue({ data: [PRODUCT], meta: { total: 1 } });
  m.listTherapists.mockResolvedValue({ data: [], meta: { total: 0 } });
  m.dealFacets.mockResolvedValue({ data: { vendors: [], branches: [], distance: [], price: null, tags: [] } });
  m.productFacets.mockResolvedValue({
    data: { categories: [{ id: OILS_ID, name: 'Oils', slug: 'oils', count: 1 }], vendors: [{ id: CALM_SPA_ID, name: 'Calm Spa', count: 1 }], tags: [], price: null },
  });
  m.therapistFacets.mockResolvedValue({ data: { vendors: [], branches: [], distance: [], price: null } });
});

describe('ListingPage', () => {
  it('/deals: one h1, breadcrumb, SERVICE category chips as links, the count on the chip row, page 1 of 12', async () => {
    renderAt('/deals');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([content.listingPages.deals.title]);
    const nav = screen.getByRole('navigation', { name: content.listingPages.deals.chipsLabel });
    const links = Array.from(nav.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      [content.listingPages.deals.all, '/deals'],
      ['Massage', '/category/massage'],
    ]);
    await waitFor(() => expect(count()).toBe('25 deals'));
    expect(m.listDeals).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 12 }));
    expect(await panelHeaders()).toEqual([
      content.category.filterPanel.location.title,
      content.category.filterPanel.distance.title,
      content.category.filterPanel.price.title,
      content.category.filterPanel.tags.title,
      content.category.filterPanel.business.title,
      content.category.filterPanel.branches.title,
    ]);
  });

  it('shows the API tag on the card image', async () => {
    renderAt('/deals');
    // React sets the option as a property or an attribute depending on the element's upgrade state.
    const option = (name: string, prop: string) => {
      const el = document.querySelector('sky-product-card') as (HTMLElement & Record<string, unknown>) | null;
      return el ? (el[prop] ?? el.getAttribute(name)) : undefined;
    };
    await waitFor(() => expect(option('badge', 'badge')).toBe(content.offerCard.tags.hot));
    expect(option('badge-color', 'badgeColor')).toBe('error');
  });

  it('/products: PRODUCT chips, Category / Price / Tags / Business filters and ?cat= sends categoryIds', async () => {
    renderAt('/products');
    const nav = screen.getByRole('navigation', { name: content.listingPages.products.chipsLabel });
    expect(Array.from(nav.querySelectorAll('a')).map((a) => a.textContent)).toEqual([content.listingPages.products.all, 'Oils']);
    expect(await panelHeaders()).toEqual([
      content.category.filterPanel.category.title,
      content.category.filterPanel.price.title,
      content.category.filterPanel.tags.title,
      content.category.filterPanel.business.title,
    ]);
    await waitFor(() => expect(document.querySelector('.checkbox-facet__label')?.textContent).toBe('Oils'));
    const box = document.querySelector('.checkbox-facet md-checkbox') as HTMLElement & { checked: boolean };
    box.checked = true;
    fireEvent.change(box);
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe(`/products?cat=${OILS_ID}`));
    await waitFor(() => expect(m.listProducts.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ categoryIds: [OILS_ID] })));
    expect(m.listProducts).not.toHaveBeenCalledWith(expect.objectContaining({ city: expect.anything() }));
  });

  it('/products?vendor= sends vendorIds to the list and the facets (item 4)', async () => {
    renderAt(`/products?vendor=${CALM_SPA_ID}`);
    await waitFor(() => expect(m.listProducts.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ vendorIds: [CALM_SPA_ID] })));
    await waitFor(() => expect(m.productFacets.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ vendorIds: [CALM_SPA_ID] })));
  });

  it('/therapists/:city: city in the h1 and the city sent to the API', async () => {
    renderAt('/therapists/pune');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(content.listingPages.therapists.cityTitle.replace('{city}', 'Pune'));
    await waitFor(() => expect(m.listTherapists).toHaveBeenCalledWith(expect.objectContaining({ city: 'Pune', state: 'Maharashtra' })));
    expect(await panelHeaders()).not.toContain(content.category.filterPanel.tags.title);
  });

  it('ItemList JSON-LD leaves out a therapist with no package price (it would read as free)', async () => {
    const priced = { id: 't1', therapistType: 'Masseur', personName: 'A', packages: [{ id: 'k', durationMinutes: 60, sellingPrice: '800', originalPrice: '900' }], vendor: null, branch: null };
    const unpriced = { ...priced, id: 't2', therapistType: 'Physio', packages: [] };
    m.listTherapists.mockResolvedValue({ data: [priced, unpriced], meta: { total: 2 } });
    renderAt('/therapists');
    await waitFor(() => {
      const list = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map((s) => JSON.parse(s.textContent ?? '{}'))
        .flat()
        .find((j) => j['@type'] === 'ItemList');
      expect(list?.itemListElement.map((e: { item: { name: string } }) => e.item.name)).toEqual(['Masseur']);
    });
  });

  it('an unknown city shows not found and is noindex', async () => {
    renderAt('/deals/atlantis');
    await waitFor(() => {
      const card = document.querySelector('sky-info-card') as (HTMLElement & { heading?: string }) | null;
      expect(card?.heading ?? card?.getAttribute('heading')).toBe(content.category.notFound.heading);
    });
    await waitFor(() => expect(robots()).toContain('noindex'));
    expect(m.listDeals).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([content.category.notFound.heading]);
  });

  it('renders the prerendered first page without a loading state, then refreshes', async () => {
    let resolve!: (v: unknown) => void;
    m.listDeals.mockImplementation(() => new Promise((r) => { resolve = r; }));
    renderAt('/deals', { [listingDataKey('deals')]: { items: [DEAL], total: 7 } });
    expect(count()).toBe('7 deals');
    expect(document.querySelector('sky-product-card')).toBeTruthy();
    resolve({ data: [DEAL], meta: { total: 8 } });
    await waitFor(() => expect(count()).toBe('8 deals'));
  });
});
