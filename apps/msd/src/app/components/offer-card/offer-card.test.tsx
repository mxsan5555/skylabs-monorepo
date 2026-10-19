import { fireEvent, render, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('shows a service with its member, branch area and distance, and links to the deal', () => {
    renderCard(<OfferCard item={{ type: 'deal', deal }} tag={{ label: 'New', color: 'tertiary', tone: 'tonal' }} />);
    expect(option(card(), 'heading')).toBe('Hydro massage');
    expect(option(card(), 'description')).toBe('Up to 89% off.');
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
});
