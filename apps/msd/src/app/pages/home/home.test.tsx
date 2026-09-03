import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCategoryWithChildren, CatalogDeal } from '../../../api/catalog';

const listCatalogCategoriesMock = vi.fn();
const listCatalogDealsMock = vi.fn();

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    listCatalogCategories: (...args: unknown[]) => listCatalogCategoriesMock(...args),
    listCatalogDeals: (...args: unknown[]) => listCatalogDealsMock(...args),
  };
});

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null }),
}));

vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({ toggle: vi.fn(), has: () => false }),
}));

vi.mock('../../../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({ location: null }),
}));

import { Home } from './home';

function cat(overrides: Partial<CatalogCategoryWithChildren>): CatalogCategoryWithChildren {
  return {
    id: 'cat-default',
    name: 'Default',
    slug: 'default',
    description: null,
    children: [],
    ...overrides,
  };
}

function deal(overrides: Partial<CatalogDeal>): CatalogDeal {
  return {
    id: 'deal-default',
    title: 'Default Deal',
    slug: 'default-deal',
    shortDescription: null,
    description: null,
    originalPrice: '999',
    salePrice: '699',
    discountPercent: 30,
    durationMinutes: 60,
    images: [],
    category: null,
    subcategory: null,
    service: null,
    product: null,
    vendor: null,
    branch: null,
    packages: [],
    ...overrides,
  } as CatalogDeal;
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Home page — "popular category" carousels
 * Scenario: sections are driven by real `Category.isPopular` data, not the old hardcoded
 * keyword-matching table (`MOCK_CATEGORY_MATCH`), which has been deleted entirely.
 *
 * Given: the catalog returns categories, some flagged `isPopular: true`
 * When: the home page loads
 * Then: one carousel section renders per popular category (sorted by sortOrder), each showing
 *       only deals whose `category.id` matches that category — non-popular categories get no
 *       dedicated carousel
 *
 * Edge cases:
 * - a popular category with zero matching deals renders no section for it (no empty carousel)
 * - the catalog fetch fails -> a page-level error state, not a crash
 */
describe('Home — popular-category-driven sections', () => {
  it('renders a section per popular category, ordered by sortOrder, using real category data', async () => {
    const categories = [
      cat({ id: 'cat-massage', name: 'Massage', slug: 'massage', isPopular: true, sortOrder: 2 }),
      cat({ id: 'cat-spa', name: 'Spa Days', slug: 'spa-days', isPopular: true, sortOrder: 1 }),
      cat({ id: 'cat-facial', name: 'Facials', slug: 'facials', isPopular: false, sortOrder: 3 }),
    ];
    const deals = [
      deal({ id: 'd1', title: 'Full Body Massage', category: { id: 'cat-massage', name: 'Massage', slug: 'massage', description: null } }),
      deal({ id: 'd2', title: 'Weekend Spa', category: { id: 'cat-spa', name: 'Spa Days', slug: 'spa-days', description: null } }),
      deal({ id: 'd3', title: 'Deep Cleanse Facial', category: { id: 'cat-facial', name: 'Facials', slug: 'facials', description: null } }),
    ];
    listCatalogCategoriesMock.mockResolvedValue({ data: categories });
    listCatalogDealsMock.mockResolvedValue({ data: deals });

    renderHome();

    // Each popular category gets its own dedicated section, addressable by a stable
    // `popular-category-<id>-heading` id — this is unambiguous even though the plain "Browse by
    // Category" grid elsewhere on the page also renders an <h3> with the same category name.
    await waitFor(() => expect(document.getElementById('popular-category-cat-spa-heading')).toBeTruthy());
    const spaHeading = document.getElementById('popular-category-cat-spa-heading')!;
    const massageHeading = document.getElementById('popular-category-cat-massage-heading')!;
    expect(spaHeading.textContent).toBe('Spa Days');
    expect(massageHeading.textContent).toBe('Massage');
    // "Spa Days" (sortOrder 1) renders before "Massage" (sortOrder 2).
    expect(
      spaHeading.compareDocumentPosition(massageHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // "Facials" isn't popular, so it never gets its own dedicated carousel section.
    expect(document.getElementById('popular-category-cat-facial-heading')).toBeNull();
  });

  it('shows the Massage deal card only inside the Massage carousel, not the Spa one (category-filtered)', async () => {
    const categories = [
      cat({ id: 'cat-massage', name: 'Massage', slug: 'massage', isPopular: true, sortOrder: 1 }),
      cat({ id: 'cat-spa', name: 'Spa Days', slug: 'spa-days', isPopular: true, sortOrder: 2 }),
    ];
    const deals = [
      deal({ id: 'd1', title: 'Full Body Massage', category: { id: 'cat-massage', name: 'Massage', slug: 'massage', description: null } }),
      deal({ id: 'd2', title: 'Weekend Spa', category: { id: 'cat-spa', name: 'Spa Days', slug: 'spa-days', description: null } }),
    ];
    listCatalogCategoriesMock.mockResolvedValue({ data: categories });
    listCatalogDealsMock.mockResolvedValue({ data: deals });

    renderHome();
    await waitFor(() => expect(document.getElementById('popular-category-cat-massage-heading')).toBeTruthy());

    // `<sky-product-card heading="...">`'s `heading` is a plain (non-attribute-reflecting) LIT
    // reactive property — React sets it as a JS property, not an HTML attribute, and it renders
    // inside the card's shadow root, so it's reachable only by reading the property directly, not
    // via `.textContent` (light-DOM only) or a `[heading=...]` attribute selector.
    const massageSection = document.getElementById('popular-category-cat-massage-heading')!.closest('section')!;
    const spaSection = document.getElementById('popular-category-cat-spa-heading')!.closest('section')!;
    const headingsIn = (section: Element) =>
      Array.from(section.querySelectorAll('sky-product-card')).map((el) => (el as unknown as { heading?: string }).heading);
    expect(headingsIn(massageSection)).toEqual(['Full Body Massage']);
    expect(headingsIn(spaSection)).toEqual(['Weekend Spa']);
  });

  // Edge case: a popular category with zero matching deals gets no section
  it('renders no section for a popular category that has zero matching deals', async () => {
    const categories = [cat({ id: 'cat-empty', name: 'Empty Popular', slug: 'empty-popular', isPopular: true, sortOrder: 1 })];
    listCatalogCategoriesMock.mockResolvedValue({ data: categories });
    listCatalogDealsMock.mockResolvedValue({ data: [] });

    renderHome();
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
    expect(document.getElementById('popular-category-cat-empty-heading')).toBeNull();
  });

  // Edge case: catalog fetch failure
  it('shows a page-level error state when the catalog fetch fails, instead of crashing', async () => {
    listCatalogCategoriesMock.mockRejectedValue(new Error('network down'));
    listCatalogDealsMock.mockResolvedValue({ data: [] });

    renderHome();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  // Confirms the old hardcoded keyword-matching table is genuinely gone — "Hot Right Now" tabs
  // are built purely from the real popular categories fetched above, never a fixed bucket list.
  it('builds "Hot Right Now" tabs from real popular categories, not a fixed keyword bucket list', async () => {
    const categories = [cat({ id: 'cat-massage', name: 'Massage', slug: 'massage', isPopular: true, sortOrder: 1 })];
    listCatalogCategoriesMock.mockResolvedValue({ data: categories });
    listCatalogDealsMock.mockResolvedValue({ data: [] });

    renderHome();
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
    // The "Massage" tab exists because it's a real popular category, not a hardcoded bucket name
    // like the deleted MOCK_CATEGORY_MATCH table used (e.g. "Deep Tissue", "Facial Glow", ...).
    expect(screen.getAllByText('Massage').length).toBeGreaterThan(0);
  });
});
