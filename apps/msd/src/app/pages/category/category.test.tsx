import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCategoryWithChildren } from '../../../api/catalog';
import { Category } from './category';

const { getCatalogCategoryMock, listCatalogDealsMock, tabsStub } = vi.hoisted(() => ({
  getCatalogCategoryMock: vi.fn(),
  listCatalogDealsMock: vi.fn(),
  tabsStub: { onChange: undefined as undefined | ((e: { target: { activeTabIndex: number } }) => void) },
}));

vi.mock('@skylabs-monorepo/shared-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@skylabs-monorepo/shared-ui/react')>()),
  Tabs: ({ onChange, children }: { onChange?: typeof tabsStub.onChange; children?: ReactNode }) => {
    tabsStub.onChange = onChange;
    return <div role="tablist">{children}</div>;
  },
}));

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    getCatalogCategory: (...args: unknown[]) => getCatalogCategoryMock(...args),
    listCatalogDeals: (...args: unknown[]) => listCatalogDealsMock(...args),
  };
});
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({ isAuthenticated: false, token: null }),
}));
vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({ toggle: vi.fn(), has: () => false }),
}));
vi.mock('../../../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({ location: null, coords: null }),
}));

const CATEGORY: CatalogCategoryWithChildren = {
  id: 'c1',
  name: 'Massage',
  slug: 'massage',
  description: null,
  children: [
    { id: 's1', name: 'Swedish', slug: 'swedish', description: null },
    { id: 's2', name: 'Deep Tissue', slug: 'deep-tissue', description: null },
  ],
} as CatalogCategoryWithChildren;

function LocationBar() {
  const location = useLocation();
  return <div data-testid="location-bar">{location.pathname + location.search}</div>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/category/:slug" element={<><Category /><LocationBar /></>} />
      </Routes>
    </MemoryRouter>,
  );

const lastSubcategoryId = () => listCatalogDealsMock.mock.calls.at(-1)?.[0]?.subcategoryId;

/** Under vitest, @lit/react resolves to its node build, which never wires element events, so the
 *  Tabs wrapper is swapped for a stub that captures `onChange`; `pickTab` then calls it the way
 *  md-tabs' `change` would. */
function pickTab(index: number) {
  act(() => {
    tabsStub.onChange?.({ target: { activeTabIndex: index } });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCatalogCategoryMock.mockResolvedValue({ data: CATEGORY });
  listCatalogDealsMock.mockResolvedValue({ data: [] });
});

describe('Category page ?sub=', () => {
  it('opens on the subcategory named by ?sub=', async () => {
    renderAt('/category/massage?sub=deep-tissue');
    await waitFor(() => expect(lastSubcategoryId()).toBe('s2'));
  });

  it('falls back to "All" for an unknown ?sub= slug', async () => {
    renderAt('/category/massage?sub=nope');
    await waitFor(() => expect(listCatalogDealsMock).toHaveBeenCalled());
    expect(lastSubcategoryId()).toBeUndefined();
  });

  it('writes the picked subcategory to ?sub= and removes it for "All"', async () => {
    renderAt('/category/massage');
    await waitFor(() => expect(screen.getByRole('tablist')).toBeTruthy());

    pickTab(1);
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage?sub=swedish'));
    await waitFor(() => expect(lastSubcategoryId()).toBe('s1'));

    pickTab(0);
    await waitFor(() => expect(screen.getByTestId('location-bar').textContent).toBe('/category/massage'));
    await waitFor(() => expect(lastSubcategoryId()).toBeUndefined());
  });
});
