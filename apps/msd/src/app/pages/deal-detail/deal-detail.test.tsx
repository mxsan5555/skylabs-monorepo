import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogDealDetail } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import content from '../../../content.json';
import { PrerenderDataProvider, dealDataKey } from '../../../prerender-data/prerender-data';
import { DealDetail } from './deal-detail';

/**
 * Feature: the deal page (docs/msd/PLANNING.md §2.7, TESTING.md §4.4 "Deal page").
 * Slug URL with old-slug replace, sections in order, price from the selected package, sold
 * out and limits, gallery full-screen view, JSON-LD, prerendered data.
 */

const m = vi.hoisted(() => ({ deal: vi.fn(), deals: vi.fn(), path: '' }));
vi.mock('../../../api/catalog', () => ({
  getCatalogDeal: (slug: string) => m.deal(slug),
  listCatalogDeals: () => m.deals(),
  getCatalogVendor: vi.fn(),
  listCatalogBanners: () => Promise.resolve({ data: [] }),
}));
vi.mock('../../components/deal-map/deal-map', () => ({
  DealMap: ({ points, ariaLabel, compact }: { points: { label: string; href?: string }[]; ariaLabel: string; compact?: boolean }) => (
    <div role="region" aria-label={ariaLabel} data-compact={String(Boolean(compact))}>
      {points.map((p) => `${p.label}|${p.href ?? 'no-link'}`).join(',')}
    </div>
  ),
}));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ isAuthenticated: false, token: null }) }));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({ has: () => false, toggle: vi.fn(), isPending: () => false }),
}));

const t = content.dealDetail;
const d = content.detailPage;

const DEAL = {
  id: 'd1',
  slug: 'swedish-massage-zen-spa-pune',
  title: 'Swedish massage',
  tagline: 'Unwind in 60 minutes',
  shortDescription: 'Unwind in 60 minutes',
  description: 'Full body Swedish massage with warm oil.',
  highlights: ['Steam bath included', 'Herbal tea after'],
  eligibility: ['18+'],
  termsAndConditions: 'Not valid on public holidays.',
  bookingRequired: true,
  bookingInstructions: 'Call the branch 24 hours before.',
  validityDays: 90,
  limitPerCustomer: 2,
  cancellationPolicy: 'FREE_48H',
  cancellationNote: null,
  currency: 'INR',
  originalPrice: '1999',
  salePrice: '1499',
  discountPercent: 25,
  durationMinutes: 60,
  images: null,
  startDate: null,
  endDate: null,
  tag: 'deal',
  boughtCount: 24,
  isSoldOut: false,
  stockLeft: 5,
  category: { id: 'c1', name: 'Massage', slug: 'massage', description: null },
  subcategory: { id: 's1', name: 'Swedish', slug: 'swedish', description: null },
  vendor: { id: 'v1', slug: 'zen-spa', businessName: 'Zen Spa', city: 'Pune', logoUrl: null, businessDescription: 'A calm spa in Kothrud.', website: 'https://zen.example' },
  branch: {
    id: 'b1',
    name: 'Kothrud',
    city: 'Pune',
    state: 'Maharashtra',
    address: 'Karve Road',
    addressLine2: 'Near the park',
    pincode: '411038',
    phone: '+919800000000',
    latitude: '18.5',
    longitude: '73.8',
    mapLocationUrl: null,
    openingHours: { mon: { open: true, start: '10:00', end: '20:00' } },
  },
  packages: [
    { id: 'p1', durationMinutes: 60, persons: 1, name: null, inclusions: ['Steam'], sellingPrice: '1499', originalPrice: '1999', discountPercent: 25 },
    { id: 'p2', durationMinutes: 60, persons: 2, name: 'Couple', inclusions: [], sellingPrice: '2800', originalPrice: '3500', discountPercent: 20 },
  ],
  faqs: [{ id: 'f1', question: 'Can I walk in?', answer: 'Book first, please.' }],
  mediaImages: [
    { id: 'i1', storageKey: 'deals/d1/a.jpg', isPrimary: true, sortOrder: 0, altText: 'Massage room with candles' },
    { id: 'i2', storageKey: 'deals/d1/b.jpg', isPrimary: false, sortOrder: 1, altText: null },
  ],
  mediaVideo: null,
  popularTags: [],
  therapists: [],
} as unknown as CatalogDealDetail;

function PathProbe() {
  const { pathname } = useLocation();
  m.path = pathname;
  return null;
}
const renderAt = (path: string, payload: Record<string, unknown> = {}) =>
  render(
    <PrerenderDataProvider payload={payload}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/deal/:slug" element={<DealDetail />} />
          <Route path="*" element={null} />
        </Routes>
        <PathProbe />
      </MemoryRouter>
    </PrerenderDataProvider>,
  );

const jsonLd = () =>
  Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap((s) => {
    const parsed = JSON.parse(s.textContent ?? '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.deal.mockResolvedValue({ data: DEAL });
  m.deals.mockResolvedValue({ data: [] });
});

describe('DealDetail', () => {
  it('opens by slug and shows the h1, tagline, highlights, member, city and the §2.7 sections', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune');
    expect(await screen.findByRole('heading', { level: 1, name: 'Swedish massage' })).toBeTruthy();
    expect(m.deal).toHaveBeenCalledWith('swedish-massage-zen-spa-pune');
    expect(screen.getByText('Unwind in 60 minutes')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: t.highlights })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(t.redeem.bookingRequired)).toBeTruthy();
    expect(screen.getByText('Call the branch 24 hours before.')).toBeTruthy();
    expect(screen.getByText(t.redeem.validFor.replace('{days}', '90'))).toBeTruthy();
    expect(screen.getByText(t.cancellation.FREE_48H)).toBeTruthy();
    expect(screen.getByText('Not valid on public holidays.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: t.sections.about.replace('{name}', 'Zen Spa') })).toBeTruthy();
    expect(screen.getByText('A calm spa in Kothrud.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: t.sections.faqs })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('an old slug or the UUID replaces the address with the current slug', async () => {
    renderAt('/deal/old-swedish-slug');
    await screen.findByRole('heading', { level: 1, name: 'Swedish massage' });
    expect(m.path).toBe('/deal/swedish-massage-zen-spa-pune');
  });

  it('prices, original price and % off follow the selected package', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune');
    const group = await screen.findByRole('group', { name: d.packageList });
    expect(within(group).getByText('Couple')).toBeTruthy();
    expect(within(group).getByText(/For 2 people/)).toBeTruthy();
    fireEvent.click(within(group).getAllByRole('button')[1]);
    expect(screen.getAllByText('₹2,800').length).toBeGreaterThan(0);
    expect(screen.getAllByText('20% off').length).toBeGreaterThan(0);
  });

  it('shows the bought count, stock left and the per-customer limit', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune');
    expect(await screen.findByText(t.availability.bought.replace('{count}', '24'))).toBeTruthy();
    expect(screen.getByText(t.availability.stockLeft.replace('{count}', '5'))).toBeTruthy();
    expect(screen.getByText(t.availability.limit.replace('{limit}', '2'))).toBeTruthy();
  });

  it('shows the branch name, address, address line 2 and city', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune');
    expect(await screen.findByText('Kothrud — Karve Road, Near the park, Pune')).toBeTruthy();
  });

  it('does not repeat the city when the address already ends with it', async () => {
    m.deal.mockResolvedValue({ data: { ...DEAL, branch: { ...DEAL.branch, address: 'Karve Road, Pune', addressLine2: null } } });
    renderAt('/deal/swedish-massage-zen-spa-pune');
    expect(await screen.findByText('Kothrud — Karve Road, Pune')).toBeTruthy();
  });

  it('shows a compact map of the branch with one plain marker (ST-26)', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune');
    const map = await screen.findByRole('region', { name: d.map.label.replace('{name}', 'Kothrud') });
    expect(map.getAttribute('data-compact')).toBe('true');
    expect(map.textContent).toBe('Kothrud|no-link');
  });

  it('shows no map when the branch has no coordinates', async () => {
    m.deal.mockResolvedValue({ data: { ...DEAL, branch: { ...DEAL.branch, latitude: null, longitude: null } } });
    renderAt('/deal/swedish-massage-zen-spa-pune');
    await screen.findByRole('heading', { level: 1, name: 'Swedish massage' });
    expect(screen.queryByRole('region', { name: d.map.label.replace('{name}', 'Kothrud') })).toBeNull();
  });

  it('sold out replaces Add to cart', async () => {
    m.deal.mockResolvedValue({ data: { ...DEAL, isSoldOut: true, stockLeft: 0 } });
    renderAt('/deal/swedish-massage-zen-spa-pune');
    expect(await screen.findByText(d.soldOut)).toBeTruthy();
    expect(screen.queryByText(d.addToCart)).toBeNull();
  });

  it('uses each image\'s own description, falling back to the title, and opens the full-screen view', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune');
    const main = await screen.findByRole('button', { name: d.gallery.open.replace('{n}', '1').replace('{count}', '2') });
    expect(within(main).getByRole('img').getAttribute('alt')).toBe('Massage room with candles');
    fireEvent.click(main);
    const dialog = document.querySelector('dialog.detail-page__lightbox') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByText(d.gallery.counter.replace('{n}', '2').replace('{count}', '2'))).toBeTruthy();
    expect(within(dialog).getByRole('img').getAttribute('alt')).toBe('Swedish massage');
  });

  it('emits Service + AggregateOffer, BreadcrumbList and FAQPage, with no rating', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune');
    await screen.findByRole('heading', { level: 1, name: 'Swedish massage' });
    const data = jsonLd();
    const service = data.find((x) => x['@type'] === 'Service');
    expect(service.offers).toMatchObject({ '@type': 'AggregateOffer', lowPrice: 1499, highPrice: 2800, offerCount: 2, priceCurrency: 'INR', availability: 'https://schema.org/InStock' });
    expect(service.provider).toMatchObject({ '@type': 'LocalBusiness', name: 'Zen Spa' });
    expect(service).not.toHaveProperty('aggregateRating');
    expect(data.find((x) => x['@type'] === 'BreadcrumbList').itemListElement).toHaveLength(4);
    expect(data.find((x) => x['@type'] === 'FAQPage').mainEntity[0].name).toBe('Can I walk in?');
    expect(document.title).toContain('Swedish massage at Zen Spa, Pune');
  });

  it('shortens a long title on a word break and keeps the member and city', async () => {
    m.deal.mockResolvedValue({ data: { ...DEAL, title: 'Premium Nail Extensions', vendor: { ...DEAL.vendor, businessName: 'Serenity Spa & Wellness' }, branch: { ...DEAL.branch, city: 'Bengaluru' } } });
    renderAt('/deal/swedish-massage-zen-spa-pune');
    await screen.findByRole('heading', { level: 1, name: 'Premium Nail Extensions' });
    expect(document.title).toBe('Premium Nail… at Serenity Spa & Wellness, Bengaluru');
  });

  it('renders from the prerendered payload without a request', async () => {
    renderAt('/deal/swedish-massage-zen-spa-pune', { [dealDataKey('swedish-massage-zen-spa-pune')]: { deal: DEAL } });
    expect(screen.getByRole('heading', { level: 1, name: 'Swedish massage' })).toBeTruthy();
    expect(m.deal).not.toHaveBeenCalled();
  });

  it('shows the not-found page with noindex for a hidden or unknown deal', async () => {
    m.deal.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Deal not found', 404));
    renderAt('/deal/gone');
    expect(await screen.findByText(t.notFound.cta)).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });
});
