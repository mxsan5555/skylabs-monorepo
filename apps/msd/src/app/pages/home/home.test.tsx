import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { CatalogCategoryWithChildren, CatalogDeal } from '../../../api/catalog';
import content from '../../../content.json';
import { Home } from './home';

const m = vi.hoisted(() => ({
  deals: vi.fn(),
  products: vi.fn(),
  therapists: vi.fn(),
  faqs: vi.fn(),
  categories: [] as unknown[],
  location: { status: 'ready', coords: null as null | { latitude: number; longitude: number } },
}));

vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  listCatalogDeals: (...a: unknown[]) => m.deals(...a),
  listCatalogProducts: (...a: unknown[]) => m.products(...a),
  listCatalogTherapists: (...a: unknown[]) => m.therapists(...a),
  listCatalogFaqs: (...a: unknown[]) => m.faqs(...a),
}));
vi.mock('../../../catalog/catalog-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../catalog/catalog-shell')>()),
  useCatalogShell: () => ({ status: 'ready', locationsStatus: 'ready', categories: m.categories, locations: [], socialLinks: [] }),
}));
vi.mock('../../../location/location-context', () => ({ useVisitorLocation: () => m.location }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ isAuthenticated: false, token: null }) }));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ toggle: vi.fn(), has: () => false }) }));
vi.mock('../../seo/site-url', () => ({
  SITE_URL: 'https://example.test',
  absoluteUrl: (p: string) => new URL(p, 'https://example.test/').toString(),
}));

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

const MASSAGE = { id: 'c-m', name: 'Massage', slug: 'massage', description: null };
const SPA = { id: 'c-s', name: 'Spa', slug: 'spa-retreats', description: null };
const FAQ = { id: 'f1', question: 'Can I cancel a booking?', answer: 'Yes, up to 24 hours before.' };

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

const dealsSection = () => document.querySelector('section[aria-labelledby="deals-heading"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  // md-tabs animates its indicator on selection; jsdom (and the shared-ui polyfills) lack getAnimations.
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => [];
  m.categories = [
    cat({
      ...MASSAGE,
      children: [
        { id: 'c-m-1', name: 'Swedish', slug: 'swedish', description: null },
        { id: 'c-m-2', name: 'Thai', slug: 'thai', description: null },
      ],
    }),
    cat({ ...SPA }),
    cat({ id: 'c-h', name: 'Hair', slug: 'hair-nails' }),
  ];
  m.deals.mockResolvedValue({
    data: [
      deal({ id: 'd1', title: 'Full Body Massage', category: MASSAGE }),
      deal({ id: 'd2', title: 'Foot Massage', category: MASSAGE }),
      deal({ id: 'd3', title: 'Weekend Spa', category: SPA }),
    ],
  });
  m.products.mockResolvedValue({ data: [] });
  m.therapists.mockResolvedValue({ data: [] });
  m.faqs.mockResolvedValue({ data: [FAQ] });
  m.location = { status: 'ready', coords: null };
});

describe('Home', () => {
  it('shows a busy status while the catalog loads', () => {
    m.deals.mockReturnValue(new Promise(() => undefined));
    renderHome();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
  });

  it('shows an alert when the catalog fails to load', async () => {
    m.deals.mockRejectedValue(new Error('network down'));
    renderHome();
    expect((await screen.findByRole('alert')).textContent).toBe(content.home.ui.messages.loadError);
  });

  it('waits for the visitor location before fetching deals, then sends its coordinates', async () => {
    m.location = { status: 'locating', coords: null };
    const { rerender } = renderHome();
    await Promise.resolve();
    expect(m.deals).not.toHaveBeenCalled();

    m.location = { status: 'ready', coords: { latitude: 26.7, longitude: 83.4 } };
    rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    await waitFor(() => expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ latitude: 26.7, longitude: 83.4 })));
  });

  it('renders one h1 and the sections in the approved order', async () => {
    renderHome();
    await screen.findByRole('heading', { level: 2, name: content.home.sections.dealsNearYou.heading });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const order = [
      content.home.sections.browseByCategory.heading,
      content.home.sections.dealsNearYou.heading,
      content.home.howItWorks.heading,
      content.home.searchByDestination.heading,
      content.home.faq.heading,
    ].map((text) => h2s.indexOf(text));
    order.forEach((index, i) => {
      expect(index).toBeGreaterThan(-1);
      if (i > 0) expect(index).toBeGreaterThan(order[i - 1]);
    });
  });

  it('renders category tiles as real light-DOM links', async () => {
    renderHome();
    const heading = await screen.findByRole('heading', { level: 2, name: content.home.sections.browseByCategory.heading });
    const list = within(heading.closest('section') as HTMLElement).getByRole('list');
    expect(within(list).getByRole('link', { name: 'Massage' }).getAttribute('href')).toBe('/category/massage');
    expect(within(list).queryByRole('link', { name: 'Skin' })).toBeNull();
    expect(within(list).getByRole('heading', { level: 3, name: 'Massage' })).toBeTruthy();
  });

  it('filters the deals carousel with category tabs, skipping categories without deals', async () => {
    renderHome();
    await screen.findByRole('heading', { level: 2, name: content.home.sections.dealsNearYou.heading });
    const tabs = Array.from(dealsSection().querySelectorAll('md-secondary-tab'));
    expect(tabs.map((tab) => tab.textContent)).toEqual([content.home.sections.dealsNearYou.allTab, 'Massage', 'Spa']);
    expect(dealsSection().querySelectorAll('sky-product-card')).toHaveLength(3);

    fireEvent.click(tabs[2]);
    await waitFor(() => expect(dealsSection().querySelectorAll('sky-product-card')).toHaveLength(1));
  });

  it('lists the three "How it works" steps', async () => {
    renderHome();
    const heading = await screen.findByRole('heading', { level: 2, name: content.home.howItWorks.heading });
    const items = (heading.closest('section') as HTMLElement).querySelectorAll('ol > li');
    expect(items).toHaveLength(3);
    content.home.howItWorks.steps.forEach((step, i) => {
      expect(within(items[i] as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe(step.title);
    });
  });

  it('emits ItemList and FAQPage JSON-LD', async () => {
    renderHome();
    await screen.findByRole('heading', { level: 2, name: content.home.faq.heading });
    const blocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap((s) => {
      const data = JSON.parse(s.textContent ?? 'null');
      return Array.isArray(data) ? data : [data];
    });
    const list = blocks.find((b) => b['@type'] === 'ItemList');
    expect(list.itemListElement).toHaveLength(3);
    for (const entry of list.itemListElement) expect(entry.item.url.startsWith('https://example.test/deal/')).toBe(true);
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    expect(faq.mainEntity[0].name).toBe(FAQ.question);
  });

  it('sets the page title and canonical URL', async () => {
    renderHome();
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(document.title).toBe(content.meta.home.title));
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.test/');
  });
});
