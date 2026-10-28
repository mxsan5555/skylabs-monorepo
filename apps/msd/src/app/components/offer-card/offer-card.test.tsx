import { act, fireEvent, render, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { SkyProductCard } from '@skylabs-monorepo/shared-ui';
import '@skylabs-monorepo/shared-ui';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { CatalogDeal, CatalogProduct } from '../../../api/catalog';
import content from '../../../content.json';
import { OfferCard } from './offer-card';

const m = vi.hoisted(() => ({
  auth: { isAuthenticated: false, token: null as string | null },
  toggle: vi.fn(),
  toggleProduct: vi.fn(),
  path: '',
}));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => m.auth }));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({ has: () => false, hasProduct: () => false, toggle: m.toggle, toggleProduct: m.toggleProduct }),
}));
// The package picker has its own tests; here it only has to render its trigger.
vi.mock('../deal-add-to-cart-dialog', () => ({
  DealAddToCartDialog: ({ renderTrigger }: { renderTrigger: (open: () => void) => ReactNode }) => renderTrigger(vi.fn()),
}));

const deal = {
  id: 'd1',
  title: 'Hydro massage',
  shortDescription: 'Up to 89% off.',
  description: null,
  originalPrice: '6500',
  salePrice: '2500',
  discountPercent: 60,
  durationMinutes: 60,
  images: [],
  vendor: { businessName: 'Delaware Injury Care' },
  branch: { city: 'Mumbai', address: 'Lower Parel, Mumbai' },
  distanceKm: 20,
  packages: [],
} as unknown as CatalogDeal;

const product = {
  id: 'p1',
  name: 'Massage Oil',
  summary: 'Calming oil.',
  description: null,
  price: '499',
  originalPrice: null,
  discount: null,
  image: null,
  imageAlt: null,
  vendor: { businessName: 'Calm Spa', city: 'Lucknow' },
} as unknown as CatalogProduct;

function PathProbe() {
  const { pathname, search } = useLocation();
  m.path = pathname + search;
  return null;
}
const renderCard = (ui: ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<>{ui}<PathProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
/** React sets a custom element's option as a property once it is registered, else as an attribute. */
const option = (el: Element, name: string) => (el as unknown as Record<string, unknown>)[name] ?? el.getAttribute(name);
const card = () => document.querySelector('sky-product-card') as HTMLElement;

beforeEach(() => {
  m.auth = { isAuthenticated: false, token: null };
  m.toggle.mockReset();
  m.toggleProduct.mockReset();
});

describe('OfferCard', () => {
  it('shows a service title without a description, then (divided) its member, branch area and distance, and links to the deal', () => {
    renderCard(<OfferCard item={{ type: 'deal', deal }} tag={{ label: 'New', color: 'tertiary', tone: 'tonal' }} />);
    expect(option(card(), 'heading')).toBe('Hydro massage');
    // Services show the title only; the member and place sit under a divider.
    expect(option(card(), 'description')).toBeNull();
    expect(option(card(), 'divided') === true || card().hasAttribute('divided')).toBe(true);
    expect(option(card(), 'eyebrow')).toBe('Delaware Injury Care');
    expect(option(card(), 'location')).toBe('Lower Parel, Mumbai');
    expect(option(card(), 'distance')).toBe(content.offerCard.distance.replace('{km}', '20'));
    expect(option(card(), 'price')).toBe('₹2,500');
    expect(option(card(), 'discount')).toBe('-60%');
    expect(option(card(), 'badge')).toBe('New');
    expect(option(card(), 'href')).toBe('/deal/d1');
    // No rating unless one is passed (no review system yet).
    expect(option(card(), 'rating')).toBeFalsy();
  });

  it('shows a product without member or place, and links to the product', () => {
    renderCard(<OfferCard item={{ type: 'product', product }} />);
    expect(option(card(), 'heading')).toBe('Massage Oil');
    expect(option(card(), 'eyebrow')).toBeFalsy();
    expect(option(card(), 'location')).toBeFalsy();
    expect(option(card(), 'href')).toBe('/products/p1');
  });

  it('names its actions after the item and sends a signed-out visitor to sign in', () => {
    renderCard(<OfferCard item={{ type: 'product', product }} />);
    const actions = within(card()).getByRole('group', { name: 'Massage Oil actions' });
    fireEvent.click(actions.querySelector('md-outlined-icon-button') as HTMLElement);
    expect(m.toggleProduct).not.toHaveBeenCalled();
    expect(m.path).toBe('/sign-in?next=%2F');
  });

  it('saves the item to the wishlist for a signed-in visitor', () => {
    m.auth = { isAuthenticated: true, token: 't' };
    renderCard(<OfferCard item={{ type: 'deal', deal }} />);
    fireEvent.click(document.querySelector('md-outlined-icon-button[aria-label="Save Hydro massage to wishlist"]') as HTMLElement);
    expect(m.toggle).toHaveBeenCalledWith('d1');
  });

  it('keeps its options after prerender and hydration (kebab-case attributes)', async () => {
    const ui = (
      <MemoryRouter>
        <OfferCard item={{ type: 'deal', deal: { ...deal, images: ['/a.jpg'] } }} tag={{ label: 'New', color: 'tertiary', tone: 'tonal' }} />
      </MemoryRouter>
    );
    const host = document.createElement('div');
    host.innerHTML = renderToString(ui);
    document.body.append(host);
    onTestFinished(() => host.remove());
    await act(async () => {
      hydrateRoot(host, ui);
    });
    const el = host.querySelector('sky-product-card') as SkyProductCard;
    expect(el.priceFirst).toBe(true);
    expect(el.badgeColor).toBe('tertiary');
    expect(el.badgeTone).toBe('tonal');
    expect(el.originalPrice).toBe('₹6,500');
    expect(el.imageAlt).toBeTruthy();
  });

  describe('slider', () => {
    const gallery = ['/a.jpg', '/b.jpg', '/c.jpg'];
    const slides = () => Array.from(card().querySelectorAll('swiper-slide img')).map((img) => img.getAttribute('src'));

    it('is off by default: the first image only, no slider', () => {
      renderCard(<OfferCard item={{ type: 'deal', deal: { ...deal, images: gallery } }} />);
      expect(card().querySelector('swiper-container')).toBeNull();
      expect(option(card(), 'image')).toBe('/a.jpg');
    });

    it('shows every image with named previous / next buttons for a service and a product', () => {
      renderCard(<OfferCard slider item={{ type: 'deal', deal: { ...deal, images: gallery } }} />);
      expect(card().querySelector('.product-card-gallery')?.getAttribute('slot')).toBe('media');
      expect(slides()).toEqual(gallery);
      const prev = card().querySelector('.product-card-gallery__button--prev') as HTMLElement;
      expect(prev.getAttribute('aria-label')).toBe('Previous image of Hydro massage');
      // The buttons never open the detail page.
      fireEvent.click(prev);
      expect(m.path).toBe('/');

      document.body.innerHTML = '';
      renderCard(<OfferCard slider layout="horizontal" item={{ type: 'product', product: { ...product, gallery } as CatalogProduct }} />);
      expect(slides()).toEqual(gallery);
    });

    it('keeps the plain image when there is only one', () => {
      renderCard(<OfferCard slider item={{ type: 'deal', deal: { ...deal, images: ['/a.jpg'] } }} />);
      expect(card().querySelector('swiper-container')).toBeNull();
      expect(option(card(), 'image')).toBe('/a.jpg');
    });
  });
});
