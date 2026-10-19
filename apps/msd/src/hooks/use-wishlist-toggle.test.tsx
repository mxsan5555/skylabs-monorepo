import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWishlistToggle } from './use-wishlist-toggle';

const m = vi.hoisted(() => ({
  auth: { isAuthenticated: true },
  toggle: vi.fn(),
  toggleProduct: vi.fn(),
  path: '',
}));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => m.auth }));
vi.mock('../wishlist/wishlist-context', () => ({
  useWishlist: () => ({
    has: (id: string) => id === 'deal-saved',
    hasProduct: (id: string) => id === 'prod-saved',
    toggle: m.toggle,
    toggleProduct: m.toggleProduct,
  }),
}));

function PathProbe() {
  const { pathname, search } = useLocation();
  m.path = pathname + search;
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
  m.auth = { isAuthenticated: true };
  m.toggle.mockReset().mockResolvedValue(true);
  m.toggleProduct.mockReset().mockResolvedValue(true);
});

describe('useWishlistToggle', () => {
  it('reads saved deals and products for a signed-in visitor', () => {
    const { result } = renderHook(() => useWishlistToggle(), { wrapper });
    expect(result.current.isFavorite('deal', 'deal-saved')).toBe(true);
    expect(result.current.isFavorite('product', 'prod-saved')).toBe(true);
    expect(result.current.isFavorite('product', 'other')).toBe(false);
  });

  it('toggles the right list', () => {
    const { result } = renderHook(() => useWishlistToggle(), { wrapper });
    act(() => {
      result.current.toggleFavorite('deal', 'd1');
      result.current.toggleFavorite('product', 'p1');
    });
    expect(m.toggle).toHaveBeenCalledWith('d1');
    expect(m.toggleProduct).toHaveBeenCalledWith('p1');
  });

  it('sends a signed-out visitor to sign in and shows nothing as saved', () => {
    m.auth = { isAuthenticated: false };
    const { result } = renderHook(() => useWishlistToggle(), { wrapper });
    expect(result.current.isFavorite('deal', 'deal-saved')).toBe(false);
    act(() => result.current.toggleFavorite('deal', 'd1'));
    expect(m.toggle).not.toHaveBeenCalled();
    expect(m.path).toBe('/sign-in?next=%2F');
  });
});
