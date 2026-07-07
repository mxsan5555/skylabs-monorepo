import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './require-auth';
import { useAuth } from './auth-context';

vi.mock('./auth-context', () => ({
  useAuth: vi.fn(),
}));

describe('RequireAuth', () => {
  it('renders children when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
    } as any);

    render(
      <MemoryRouter>
        <RequireAuth>
          <h1>Dashboard</h1>
        </RequireAuth>
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('redirects when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
    } as any);

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <h1>Dashboard</h1>
              </RequireAuth>
            }
          />
          <Route path="/sign-in" element={<h1>Sign In</h1>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Sign In')).toBeTruthy();
  });
});