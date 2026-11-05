import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRequireSignIn } from './use-require-sign-in';

const m = vi.hoisted(() => ({ auth: { isAuthenticated: true }, path: '' }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => m.auth }));

function PathProbe() {
  const { pathname, search } = useLocation();
  m.path = pathname + search;
  return null;
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/showcase']}>
    <Routes>
      <Route path="*" element={<>{children}<PathProbe /></>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  m.auth = { isAuthenticated: true };
});

describe('useRequireSignIn', () => {
  it('lets a signed-in visitor through and stays on the page', () => {
    const { result } = renderHook(() => useRequireSignIn(), { wrapper });
    expect(result.current()).toBe(true);
    expect(m.path).toBe('/showcase');
  });

  it('sends a signed-out visitor to sign in and back to this page', () => {
    m.auth = { isAuthenticated: false };
    const { result } = renderHook(() => useRequireSignIn(), { wrapper });
    let allowed = true;
    act(() => {
      allowed = result.current();
    });
    expect(allowed).toBe(false);
    expect(m.path).toBe('/sign-in?next=%2Fshowcase');
  });
});
