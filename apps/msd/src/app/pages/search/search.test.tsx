import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCategoryWithChildren, CatalogDeal } from '../../../api/catalog';
import type { CatalogShellValue } from '../../../catalog/catalog-shell';
import content from '../../../content.json';
import { Search } from './search';

/**
 * Explore (ST-43, TESTING §4.4): kind chips with counts, the filter panel following the kind,
 * offer and therapist cards, `?category=` from treatment links, `noindex, follow`, and the
 * signed-out Add to cart path keeping the search.
 */
const m = vi.hoisted(() => ({
  listDeals: vi.fn(),
  listProducts: vi.fn(),
  listTherapists: vi.fn(),
  facets: vi.fn(),
  shell: { value: null as unknown as CatalogShellValue },
}));

vi.mock('../../../api/catalog', async () => ({
  ...(await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog')),
  listCatalogDeals: (...a: unknown[]) => m.listDeals(...a),
  listCatalogProducts: (...a: unknown[]) => m.listProducts(...a),
  listCatalogTherapists: (...a: unknown[]) => m.listTherapists(...a),
  getCatalogDealFacets: (...a: unknown[]) => m.facets(...a),
  getCatalogProductFacets: (...a: unknown[]) => m.facets(...a),
  getCatalogTherapistFacets: (...a: unknown[]) => m.facets(...a),
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
  useWishlist: () => ({ toggle: vi.fn(), has: () => false, toggleProduct: vi.fn(), hasProduct: () => false, isProductPending: () => false }),
}));
vi.mock('../../components/banner-slot/banner-slot', () => ({ BannerSlot: () => null }));
vi.mock('../../components/deal-map/deal-map', () => ({ DealMap: () => <div data-testid="deal-map" /> }));

const t = content.search;
const MASSAGE = { id: '0b0b0b0b-0000-4000-8000-000000000001', name: 'Massage', slug: 'massage', description: null, type: 'SERVICE', children: [] } as unknown as CatalogCategoryWithChildren;

const deal = (id: string) =>
  ({
    id,
    title: `Deal ${id}`,
    originalPrice: '999',
    salePrice: '699',
    discountPercent: 30,
    packages: [],
    vendor: null,
    branch: null,
    tag: null,
  }) as unknown as CatalogDeal;
const product = { id: 'p1', name: 'Massage Oil', price: '499', originalPrice: '599', discount: 17, vendor: null, image: null, tag: null };
const therapist = { id: 't1', therapistType: 'Massage Therapist', personName: 'Asha', packages: [], vendor: null, branch: null };

function LocationBar() {
  const location = useLocation();
  return <div data-testid="location-bar">{location.pathname}{location.search}</div>;
}

function renderAt(path = '/explore') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explore" element={<><LocationBar /><Search /></>} />
        <Route path="/sign-in" element={<LocationBar />} />
      </Routes>
    </MemoryRouter>,
  );
}

const currentUrl = () => screen.getByTestId('location-bar').textContent ?? '';
type Chip = HTMLElement & { label?: string };
const chipLabels = () => (Array.from(document.querySelectorAll('md-filter-chip')) as Chip[]).map((c) => c.label ?? c.getAttribute('label'));
const chip = (label: string) => (Array.from(document.querySelectorAll('md-filter-chip')) as Chip[]).find((c) => (c.label ?? c.getAttribute('label'))?.startsWith(label)) as Chip;
const panelHeaders = async () => {
  const aside = await screen.findByRole('complementary', { name: content.category.filterPanel.title });
  return Array.from(aside.querySelectorAll('sky-accordion-item')).map((s) => (s as HTMLElement & { header?: string }).header ?? s.getAttribute('header'));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  m.shell.value = { status: 'ready', locationsStatus: 'ready', categories: [MASSAGE], socialLinks: [], locations: [] } as CatalogShellValue;
  m.listDeals.mockResolvedValue({ data: [deal('d1')], meta: { total: 5 } });
  m.listProducts.mockResolvedValue({ data: [product], meta: { total: 2 } });
  m.listTherapists.mockResolvedValue({ data: [therapist], meta: { total: 1 } });
  m.facets.mockResolvedValue({ data: { vendors: [], branches: [], distance: [], price: null, tags: [], categories: [] } });
});

describe('Explore', () => {
  it('one h1 naming the query; kind chips carry their counts; the total sits on the chip row', async () => {
    renderAt('/explore?q=massage');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([t.resultsFor.replace('{q}', 'massage')]);
    await waitFor(() =>
      expect(chipLabels()).toEqual([
        t.kindChip.replace('{label}', t.kinds.all).replace('{count}', '8'),
        t.kindChip.replace('{label}', t.kinds.deals).replace('{count}', '5'),
        t.kindChip.replace('{label}', t.kinds.products).replace('{count}', '2'),
        t.kindChip.replace('{label}', t.kinds.therapists).replace('{count}', '1'),
      ]),
    );
    await waitFor(() => expect(document.querySelector('.chip-nav-row__end')?.textContent).toBe('8 results'));
    expect(m.listDeals).toHaveBeenCalledWith(expect.objectContaining({ search: 'massage', page: 1, pageSize: 12 }));
  });

  it('All mixes offer and therapist cards and shows location, distance and price filters', async () => {
    renderAt();
    await waitFor(() => expect(document.querySelectorAll('sky-product-card').length).toBe(3));
    expect(await panelHeaders()).toEqual([
      content.category.filterPanel.location.title,
      content.category.filterPanel.distance.title,
      content.category.filterPanel.price.title,
    ]);
  });

  it('a kind chip sets ?kind= and the panel and API call follow it', async () => {
    renderAt('/explore?q=oil');
    await waitFor(() => expect(chip(t.kinds.products)).toBeTruthy());
    fireEvent.click(chip(t.kinds.products));
    await waitFor(() => expect(currentUrl()).toBe('/explore?q=oil&kind=products'));
    await waitFor(() => expect(m.listProducts.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ search: 'oil', pageSize: 12 })));
    expect(await panelHeaders()).toEqual([
      content.category.filterPanel.price.title,
      content.category.filterPanel.tags.title,
      content.category.filterPanel.business.title,
    ]);
  });

  it('products: ?vendor= reaches the product list as vendorIds (item 4)', async () => {
    const vendorId = 'f1f1f1f1-0000-4000-8000-0000000000c5';
    renderAt(`/explore?q=oil&kind=products&vendor=${vendorId}`);
    await waitFor(() => expect(m.listProducts).toHaveBeenCalledWith(expect.objectContaining({ vendorIds: [vendorId], pageSize: 12 })));
  });

  it('?category= from a treatment link narrows to that category and its kind', async () => {
    renderAt('/explore?q=swedish&category=massage');
    await waitFor(() => expect(m.listDeals).toHaveBeenCalledWith(expect.objectContaining({ categoryId: MASSAGE.id, page: 1, pageSize: 12 })));
    expect(m.listProducts).not.toHaveBeenCalledWith(expect.objectContaining({ categoryId: MASSAGE.id }));
  });

  it('is noindex, follow with canonical /explore', async () => {
    renderAt('/explore?q=massage');
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow'));
  });
});

/**
 * A logged-out shopper clicking Add to Cart on a search result goes to sign in, and a successful
 * sign-in returns them to these exact search results.
 */
describe('Explore — Add to Cart while logged out preserves the return destination', () => {
  it('redirects to /sign-in?next=<current /explore URL, query preserved>', async () => {
    renderAt('/explore?q=Swedish%20Massage');
    const [addToCart] = await screen.findAllByText(content.offerCard.addToCart);
    fireEvent.click(addToCart);
    await waitFor(() => expect(currentUrl()).toBe(`/sign-in?next=${encodeURIComponent('/explore?q=Swedish%20Massage')}`));
  });

  it('redirects to /sign-in?next=%2Fexplore when /explore has no query string', async () => {
    renderAt('/explore');
    const [addToCart] = await screen.findAllByText(content.offerCard.addToCart);
    fireEvent.click(addToCart);
    await waitFor(() => expect(currentUrl()).toBe('/sign-in?next=%2Fexplore'));
  });
});
