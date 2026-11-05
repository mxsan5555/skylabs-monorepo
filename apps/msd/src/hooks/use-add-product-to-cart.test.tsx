import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import content from '../content.json';
import { useAddProductToCart } from './use-add-product-to-cart';

const m = vi.hoisted(() => ({
  auth: { isAuthenticated: true, token: 't' as string | null },
  addCartItem: vi.fn(),
  snackbar: vi.fn(),
  path: '',
}));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => m.auth }));
vi.mock('../api/cart', () => ({ addCartItem: (...a: unknown[]) => m.addCartItem(...a) }));
vi.mock('../snackbar/snackbar', () => ({ showSnackbar: (...a: unknown[]) => m.snackbar(...a) }));

function PathProbe() {
  m.path = useLocation().pathname + useLocation().search;
  return null;
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="*" element={<>{children}<PathProbe /></>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  m.auth = { isAuthenticated: true, token: 't' };
  m.addCartItem.mockReset().mockResolvedValue({ data: {} });
  m.snackbar.mockReset();
});

describe('useAddProductToCart', () => {
  it('adds one item and offers the cart', async () => {
    const { result } = renderHook(() => useAddProductToCart(), { wrapper });
    let added = false;
    await act(async () => {
      added = await result.current('p1', 'Massage Oil');
    });
    expect(added).toBe(true);
    expect(m.addCartItem).toHaveBeenCalledWith('t', { productId: 'p1', quantity: 1 });
    expect(m.snackbar).toHaveBeenCalledWith('Added "Massage Oil" to your cart.', expect.objectContaining({
      variant: 'success',
      actionLabel: content.cartToast.viewCart,
    }));
  });

  it('sends a signed-out visitor to sign in and back', async () => {
    m.auth = { isAuthenticated: false, token: null };
    const { result } = renderHook(() => useAddProductToCart(), { wrapper });
    await act(async () => {
      await result.current('p1', 'Massage Oil');
    });
    expect(m.addCartItem).not.toHaveBeenCalled();
    expect(m.path).toBe('/sign-in?next=%2F');
  });

  it('says so when adding fails', async () => {
    m.addCartItem.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useAddProductToCart(), { wrapper });
    await act(async () => {
      await result.current('p1', 'Massage Oil');
    });
    expect(m.snackbar).toHaveBeenCalledWith(content.cartToast.error, { variant: 'error' });
  });
});
