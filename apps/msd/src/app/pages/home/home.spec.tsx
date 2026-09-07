import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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