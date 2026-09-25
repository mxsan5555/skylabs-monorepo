import type { ReactNode } from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { notifyCartUpdated } from '../api/cart';
import { CartCountProvider, useCartCount } from './use-cart-count';

const { auth, getCart } = vi.hoisted(() => ({
  auth: { isAuthenticated: true, token: 'tok' as string | null },
  getCart: vi.fn(),
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => auth }));
vi.mock('../api/cart', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/cart')>()),
  getCart,
}));

const cartWith = (...quantities: number[]) => ({
  data: { id: 'cart', customerId: 'c', items: quantities.map((quantity, i) => ({ id: `i${i}`, quantity })) },
});

function Count({ id }: { id: string }) {
  return <span data-testid={id}>{useCartCount()}</span>;
}

const wrapper = ({ children }: { children: ReactNode }) => <CartCountProvider>{children}</CartCountProvider>;

beforeEach(() => {
  auth.isAuthenticated = true;
  auth.token = 'tok';
  getCart.mockReset();
  getCart.mockResolvedValue(cartWith(2, 3));
});

describe('useCartCount', () => {
  it('returns 0 outside a CartCountProvider', () => {
    const { result } = renderHook(() => useCartCount());
    expect(result.current).toBe(0);
    expect(getCart).not.toHaveBeenCalled();
  });

  it('sums item quantities', async () => {
    const { result } = renderHook(() => useCartCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(5));
    expect(getCart).toHaveBeenCalledWith('tok');
  });

  it('refetches when the cart is updated', async () => {
    const { result } = renderHook(() => useCartCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(5));
    getCart.mockResolvedValue(cartWith(1));
    act(() => notifyCartUpdated());
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('resets to 0 when signed out', async () => {
    const { result, rerender } = renderHook(() => useCartCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(5));
    auth.isAuthenticated = false;
    auth.token = null;
    rerender();
    await waitFor(() => expect(result.current).toBe(0));
  });

  it('fetches the cart once for several consumers', async () => {
    render(
      <CartCountProvider>
        <Count id="a" />
        <Count id="b" />
      </CartCountProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('a').textContent).toBe('5'));
    expect(screen.getByTestId('b').textContent).toBe('5');
    expect(getCart).toHaveBeenCalledTimes(1);
  });
});
