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

vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({
    ...wishlistState,
    loading: false,
    remove: vi.fn(),
    removeProduct: vi.fn(),
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
  it('shows the total count including saved products', () => {
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

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Saved Items (1 item)',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Massage Oil')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Massage Oil' }).getAttribute('src')).toBe(
      'https://cdn.example.test/products/massage-oil.jpg',
    );
  });
});
