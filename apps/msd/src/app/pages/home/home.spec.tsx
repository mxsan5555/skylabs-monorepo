import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from './home';
import '@testing-library/jest-dom/vitest';
import { listCatalogCategories, listCatalogDeals } from '../../../api/catalog';

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: null,
    isAuthenticated: false,
    bootstrap: null,
    loading: false,
    isPreviewing: false,
    can: () => false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshBootstrap: vi.fn(),
    loginAsUser: vi.fn(),
    returnToSuperAdmin: vi.fn(),
  }),
}));

vi.mock('../../../wishlist/wishlist-context', () => ({
  useWishlist: () => ({
    toggle: vi.fn(),
    has: vi.fn(() => false),
  }),
}));

vi.mock('../../../api/catalog', () => ({
  listCatalogCategories: vi.fn(),
  listCatalogDeals: vi.fn(),
}));

const mockCategory = {
  id: 'cat-1',
  name: 'Massage',
  slug: 'massage',
  children: [],
};

const mockDeal = {
  id: 'deal-1',
  title: 'Relaxing Massage',
  salePrice: '999',
  originalPrice: '1499',
  discountPercent: 33,
  durationMinutes: 60,
  category: mockCategory,
  subcategory: {
    id: 'sub-1',
    name: 'Massage',
    slug: 'massage',
  },
  vendor: {
    businessName: 'Relax Spa',
    slug: 'relax-spa',
  },
  service: {
    name: 'Relaxing Massage',
    imageAlt: 'Relaxing Massage',
  },
  product: undefined,
};
describe('Home', () => {
  it('shows loading state while catalog data is loading', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
  it('shows error message when catalog API fails', async () => {
    vi.mocked(listCatalogCategories).mockRejectedValue(
      new Error('Could not load home page content.'),
    );

    vi.mocked(listCatalogDeals).mockRejectedValue(
      new Error('Could not load home page content.'),
    );

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(/could not load home page content/i);
  });

});