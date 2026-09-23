import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { CatalogCategoryWithChildren, CatalogDeal, CatalogProduct, CatalogTherapist } from '../../../api/catalog';
import content from '../../../content.json';
import { Home } from './home';

const m = vi.hoisted(() => ({
  deals: vi.fn(),
  products: vi.fn(),
  therapists: vi.fn(),
  faqs: vi.fn(),
  categories: [] as unknown[],
  location: { status: 'ready', coords: null as null | { latitude: number; longitude: number } },
  auth: { isAuthenticated: false, token: null as string | null },
  toggle: vi.fn(),
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
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => m.auth }));
vi.mock('../../../wishlist/wishlist-context', () => ({ useWishlist: () => ({ toggle: m.toggle, has: () => false }) }));
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

const THERAPIST = {
  id: 't1',
  personName: 'Asha',
  therapistType: 'Physiotherapist',
  packages: [],
  vendor: null,
  branch: null,
} as unknown as CatalogTherapist;
const PRODUCT = {
  id: 'p1',
  name: 'Massage Oil',
  slug: 'massage-oil',
  image: null,
  imageAlt: null,
  price: '499',
  originalPrice: null,
  discount: null,
  vendor: null,
} as unknown as CatalogProduct;

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{pathname + search}</p>;
}

function HomeRoutes() {
  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sign-in" element={<p>Sign-in page</p>} />
        <Route path="/explore" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderHome() {
  return render(<HomeRoutes />);
}

const dealsSection = () => document.querySelector('section[aria-labelledby="deals-heading"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  m.categories = [
    cat({
      ...MASSAGE,
      children: [
        { id: 'c-m-1', name: 'Swedish', slug: 'swedish', description: null },
        { id: 'c-m-2', name: 'Thai', slug: 'thai', description: null },
      ],
    }),
    cat({ ...SPA }),
    cat({ id: 'c-h', name: 'Hair', slug: 'hair-nails', children: [{ id: 'c-h-1', name: 'Cut', slug: 'cut', description: null }] }),
  ];
  m.deals.mockResolvedValue({
    data: [
      deal({ id: 'd1', title: 'Full Body Massage', category: MASSAGE, images: ['https://cdn.test/d1.jpg'] }),
      deal({ id: 'd2', title: 'Foot Massage', category: MASSAGE }),
      deal({ id: 'd3', title: 'Weekend Spa', category: SPA }),
    ],
  });
  m.products.mockResolvedValue({ data: [] });
  m.therapists.mockResolvedValue({ data: [] });
  m.faqs.mockResolvedValue({ data: [FAQ] });
  m.location = { status: 'ready', coords: null };
  m.auth = { isAuthenticated: false, token: null };
});

describe('Home', () => {
  it('renders the static sections at once and a busy deals placeholder while the catalog loads', () => {
    m.deals.mockReturnValue(new Promise(() => undefined));
    renderHome();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Massage' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: content.home.howItWorks.heading })).toBeTruthy();
    const status = within(dealsSection()).getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('heading', { level: 2, name: content.home.faq.heading })).toBeNull();
  });

  it('shows the load error inside the deals section and keeps the static sections', async () => {
    m.deals.mockRejectedValue(new Error('network down'));
    renderHome();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(content.home.ui.messages.loadError);
    expect(dealsSection().contains(alert)).toBe(true);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Massage' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: content.home.partnerBanner.heading })).toBeTruthy();
  });

  it('waits for the visitor location before fetching deals, then sends its coordinates', async () => {
    m.location = { status: 'locating', coords: null };
    const { rerender } = renderHome();
    await Promise.resolve();
    expect(m.deals).not.toHaveBeenCalled();

    m.location = { status: 'ready', coords: { latitude: 26.7, longitude: 83.4 } };
    rerender(<HomeRoutes />);
    await waitFor(() => expect(m.deals).toHaveBeenCalledWith(expect.objectContaining({ latitude: 26.7, longitude: 83.4 })));
  });

  it('renders one h1 and the sections in the approved order', async () => {
    m.therapists.mockResolvedValue({ data: [THERAPIST] });
    m.products.mockResolvedValue({ data: [PRODUCT] });
    renderHome();
    await screen.findByRole('heading', { level: 2, name: content.home.sections.dealsNearYou.heading });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const order = [
      content.home.sections.browseByCategory.heading,
      content.home.sections.dealsNearYou.heading,
      content.home.howItWorks.heading,
      content.home.sections.therapists.heading,
      content.home.sections.featuredProducts.heading,
      content.home.searchByDestination.heading,
      content.home.faq.heading,
      content.home.partnerBanner.heading,
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
    const texts = Array.from(list.querySelectorAll('sky-tile-card')).map((el) => (el as unknown as { text?: string }).text);
    expect(texts).toEqual([
      content.home.categoryTileText.replace('{count}', '2'),
      undefined,
      content.home.categoryTileTextOne,
    ]);
  });

  it('filters the deals carousel with category tabs, skipping categories without deals', async () => {
    renderHome();
    await screen.findByRole('heading', { level: 2, name: content.home.sections.dealsNearYou.heading });
    const tabs = Array.from(dealsSection().querySelectorAll('md-secondary-tab'));
    expect(tabs.map((tab) => tab.textContent)).toEqual([content.home.sections.dealsNearYou.allTab, 'Massage', 'Spa']);
    expect(dealsSection().querySelectorAll('sky-product-card')).toHaveLength(3);

    expect(tabs.map((tab) => tab.id)).toEqual(['deals-tab-all', 'deals-tab-c-m', 'deals-tab-c-s']);
    for (const tab of tabs) expect(tab.getAttribute('aria-controls')).toBe('deals-panel');
    const panel = within(dealsSection()).getByRole('tabpanel');
    expect(panel.id).toBe('deals-panel');
    expect(panel.getAttribute('aria-labelledby')).toBe('deals-tab-all');

    fireEvent.click(tabs[2]);
    await waitFor(() => expect(dealsSection().querySelectorAll('sky-product-card')).toHaveLength(1));
    expect(within(dealsSection()).getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('deals-tab-c-s');
  });

  it('hides the member banner when signed in', async () => {
    const headlines = () =>
      Array.from(document.querySelectorAll('sky-feature-card')).map((el) => (el as unknown as { headline?: string }).headline);
    const { unmount } = renderHome();
    await screen.findByRole('heading', { level: 2, name: content.home.sections.dealsNearYou.heading });
    expect(headlines()).toContain(content.home.memberBanner.heading);
    unmount();

    m.auth = { isAuthenticated: true, token: 't' };
    renderHome();
    await screen.findByRole('heading', { level: 2, name: content.home.sections.dealsNearYou.heading });
    expect(headlines()).not.toContain(content.home.memberBanner.heading);
  });

  it('sends a signed-out visitor to sign in when they favourite a deal', async () => {
    renderHome();
    // The card attaches its `favorite` listener in an effect, so re-dispatch until it is wired up.
    await waitFor(() => {
      const card = dealsSection()?.querySelector('sky-product-card');
      if (card) fireEvent(card, new CustomEvent('favorite'));
      expect(screen.getByText('Sign-in page')).toBeTruthy();
    });
  });

  it('describes the spotlight price for screen readers and serves a responsive hero image', async () => {
    renderHome();
    const spotlight = await waitFor(() => {
      const el = document.querySelector('.home-spotlight');
      if (!el) throw new Error('no spotlight yet');
      return el;
    });
    expect(spotlight.textContent).toContain(content.home.hero.spotlightWas);
    expect(spotlight.textContent).toContain(content.home.hero.spotlightOff);
    const hero = screen.getByRole('img', { name: content.home.hero.imageAlt });
    expect(hero.getAttribute('srcset')).toContain('640w');
    expect(hero.getAttribute('sizes')).toBe('(min-width: 840px) 52vw, 100vw');
  });

  it('hero search navigates to /explore with the trimmed query, or to /explore when empty', async () => {
    const field = () => document.querySelector('.home-hero sky-action-field') as Element;
    const { unmount } = renderHome();
    fireEvent(field(), new CustomEvent('sky-submit', { detail: { value: 'hot stone' } }));
    expect((await screen.findByTestId('location')).textContent).toBe('/explore?q=hot%20stone');
    unmount();

    renderHome();
    fireEvent(field(), new CustomEvent('sky-submit', { detail: { value: '' } }));
    expect((await screen.findByTestId('location')).textContent).toBe('/explore');
  });

  it('links the welcome offer CTA to /explore', () => {
    renderHome();
    const cta = document.querySelector('.home-offer--welcome md-filled-button') as Element & { href?: string };
    expect(cta.getAttribute('href') ?? cta.href).toBe('/explore');
  });

  it('toggles the wishlist when a signed-in visitor favourites a deal', async () => {
    m.auth = { isAuthenticated: true, token: 't' };
    renderHome();
    await waitFor(() => {
      const card = dealsSection()?.querySelector('sky-product-card');
      if (card) fireEvent(card, new CustomEvent('favorite'));
      expect(m.toggle).toHaveBeenCalledWith('d1');
    });
  });

  it('links popular treatments to an /explore search', () => {
    renderHome();
    const [group] = content.home.searchByDestination.columns.flat();
    const link = screen.getByRole('link', { name: group.items[0] });
    expect(link.getAttribute('href')).toBe(`/explore?q=${encodeURIComponent(group.items[0])}`);
  });

  it('renders no tabs or tabpanel when the deals share no category', async () => {
    m.deals.mockResolvedValue({ data: [deal({ id: 'x1' }), deal({ id: 'x2' })] });
    renderHome();
    await waitFor(() => expect(dealsSection().querySelectorAll('sky-product-card')).toHaveLength(2));
    expect(dealsSection().querySelector('md-secondary-tab')).toBeNull();
    expect(within(dealsSection()).queryByRole('tabpanel')).toBeNull();
  });

  it('falls back to the All tab when the active category disappears after a refetch', async () => {
    const { rerender } = renderHome();
    await waitFor(() => expect(dealsSection().querySelectorAll('md-secondary-tab')).toHaveLength(3));
    fireEvent.click(dealsSection().querySelectorAll('md-secondary-tab')[2]);
    await waitFor(() => expect(dealsSection().querySelectorAll('sky-product-card')).toHaveLength(1));

    m.deals.mockResolvedValue({
      data: [deal({ id: 'd1', title: 'Full Body Massage', category: MASSAGE }), deal({ id: 'd2', title: 'Foot Massage', category: MASSAGE })],
    });
    m.location = { status: 'ready', coords: { latitude: 1, longitude: 2 } };
    rerender(<HomeRoutes />);
    await waitFor(() => expect(dealsSection().querySelectorAll('md-secondary-tab')).toHaveLength(2));
    expect(within(dealsSection()).getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('deals-tab-all');
    expect(dealsSection().querySelectorAll('sky-product-card')).toHaveLength(2);
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
    expect(list.itemListElement[0].item.image).toBe('https://cdn.test/d1.jpg');
    expect(list.itemListElement[1].item.image).toBeUndefined();
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
