import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Wishlist } from './wishlist';

const wishlistState = vi.hoisted(() => ({
  items: [] as Array<{
    id: string;
    customerId: string;
    dealId: string | null;
    productId: string | null;
    createdAt: string;
    deal: null;
    product: {
      id: string;
      name: string;
      slug: string;
      brand: string | null;
      image: string | null;
      imageAlt: string | null;
      mediaImages?: Array<{
        storageKey: string;
        isPrimary: boolean;
        sortOrder: number;
      }>;
      price: string | number;
      originalPrice: string | number | null;
      discount: number | null;
      isNew: boolean;
      isFeatured: boolean;
      isActive: boolean;
    } | null;
  }>,
  itemCount: 0 as number,
}));

// The wishlist is a signed-in page; its cards read the session for Add to cart.
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ isAuthenticated: true, token: 'test-token' }) }));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({
    ...wishlistState,
    loading: false,
    remove: vi.fn(),
    removeProduct: vi.fn(),
    toggle: vi.fn(),
    toggleProduct: vi.fn(),
    has: () => true,
    hasProduct: () => true,
  }),
}));

vi.mock('../../components/deal-card', () => ({
  DealCard: ({ deal }: { deal: { title: string; image: string; imageAlt: string } }) => (
    <article>
      {deal.title}
      <img src={deal.image} alt={deal.imageAlt} />
    </article>
  ),
}));

describe('Wishlist page', () => {
  it('lists saved products under the Saved Items heading, with their image', () => {
    wishlistState.items = [
      {
        id: 'wishlist-product-1',
        customerId: 'customer-1',
        dealId: null,
        productId: 'product-1',
        createdAt: '2026-10-07T00:00:00.000Z',
        deal: null,
        product: {
          id: 'product-1',
          name: 'Massage Oil',
          slug: 'massage-oil',
          brand: null,
          image: null,
          imageAlt: null,
          mediaImages: [
            {
              storageKey: 'https://cdn.example.test/products/massage-oil.jpg',
              isPrimary: true,
              sortOrder: 0,
            },
          ],
          price: 499,
          originalPrice: null,
          discount: null,
          isNew: false,
          isFeatured: false,
          isActive: true,
        },
      },
    ];
    wishlistState.itemCount = 1;

    render(
      <MemoryRouter>
        <Wishlist />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Saved Items' })).toBeTruthy();
    // Products render as OfferCard (`sky-product-card`): title and single image are attributes
    // (a slider takes the media slot only with two or more images).
    const card = document.querySelector('sky-product-card[heading="Massage Oil"]');
    expect(card).toBeTruthy();
    expect(card?.getAttribute('image')).toBe('https://cdn.example.test/products/massage-oil.jpg');
  });
});
