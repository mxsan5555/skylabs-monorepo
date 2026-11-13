import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistProvider, useWishlist } from './wishlist-context';

const mocks = vi.hoisted(() => ({
  getWishlist: vi.fn(),
  addToWishlist: vi.fn(),
  addProductToWishlist: vi.fn(),
  removeFromWishlist: vi.fn(),
  removeProductFromWishlist: vi.fn(),
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    isAuthenticated: true,
  }),
}));

vi.mock('../api/wishlist', () => ({
  getWishlist: mocks.getWishlist,
  addToWishlist: mocks.addToWishlist,
  addProductToWishlist: mocks.addProductToWishlist,
  removeFromWishlist: mocks.removeFromWishlist,
  removeProductFromWishlist: mocks.removeProductFromWishlist,
}));

describe('WishlistProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a product saved when the initial wishlist load resolves after the add', async () => {
    let resolveInitialLoad!: (result: { data: [] }) => void;
    mocks.getWishlist.mockReturnValue(
      new Promise((resolve) => {
        resolveInitialLoad = resolve;
      }),
    );

    const productItem = {
      id: 'wishlist-item-1',
      customerId: 'customer-1',
      dealId: null,
      productId: 'product-1',
      createdAt: '2026-10-07T00:00:00.000Z',
      deal: null,
      product: {
        id: 'product-1',
        name: 'Massage Oil',
      },
    };
    mocks.addProductToWishlist.mockResolvedValue({
      data: productItem,
    });

    const { result } = renderHook(() => useWishlist(), {
      wrapper: ({ children }) => (
        <WishlistProvider>{children}</WishlistProvider>
      ),
    });

    await act(async () => {
      await result.current.toggleProduct('product-1');
    });

    expect(mocks.addProductToWishlist).toHaveBeenCalledWith(
      'test-token',
      'product-1',
    );
    expect(result.current.hasProduct('product-1')).toBe(true);
    expect(result.current.itemCount).toBe(1);

    await act(async () => {
      resolveInitialLoad({ data: [] });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.hasProduct('product-1')).toBe(true);
    expect(result.current.itemCount).toBe(1);
    expect(result.current.items).toContainEqual(productItem);
  });
});
