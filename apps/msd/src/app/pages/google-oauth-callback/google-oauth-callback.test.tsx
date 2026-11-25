import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
import GoogleOAuthCallback from './google-oauth-callback';

const state = vi.hoisted(() => ({ auth: { loading: false, bootstrap: null as BootstrapResponse | null }, location: '' }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => state.auth }));

function Destination() {
  const location = useLocation();
  state.location = `${location.pathname}${location.search}`;
  return <div data-testid="destination">{state.location}</div>;
}

function renderCallback(path = '/auth/google/callback') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/google/callback" element={<GoogleOAuthCallback />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}

function bootstrapWithRoles(...keys: string[]): BootstrapResponse {
  return { roles: keys.map((key) => ({ key })) } as unknown as BootstrapResponse;
}

beforeEach(() => {
  state.auth = { loading: false, bootstrap: bootstrapWithRoles('customer') };
  state.location = '';
});

describe('Google OAuth frontend callback', () => {
  it('waits for refresh/bootstrap and then opens the customer dashboard', async () => {
    state.auth.loading = true;
    const view = renderCallback();
    expect(screen.getByRole('status').textContent).toContain('Finishing sign-in');
    expect(state.location).toBe('');
    state.auth = { loading: false, bootstrap: bootstrapWithRoles('customer') };
    view.rerender(
      <MemoryRouter initialEntries={['/auth/google/callback']}>
        <Routes>
          <Route path="/auth/google/callback" element={<GoogleOAuthCallback />} />
          <Route path="*" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(state.location).toBe('/my-dashboard'));
  });

  it('preserves a safe customer return path and rejects an external destination', async () => {
    const { unmount } = renderCallback('/auth/google/callback?next=%2Forders%3Fstatus%3Dpaid');
    await waitFor(() => expect(state.location).toBe('/orders?status=paid'));
    unmount();
    renderCallback('/auth/google/callback?next=https%3A%2F%2Fevil.example');
    await waitFor(() => expect(state.location).toBe('/my-dashboard'));
  });

  it('uses the existing role destination for staff and dual-role accounts', async () => {
    state.auth.bootstrap = bootstrapWithRoles('admin');
    const { unmount } = renderCallback();
    await waitFor(() => expect(state.location).toBe('/account/dashboard'));
    unmount();
    state.location = '';
    state.auth.bootstrap = bootstrapWithRoles('customer', 'member');
    renderCallback();
    await waitFor(() => expect(state.location).toBe('/choose-experience'));
  });

  it('returns to sign-in with a safe error state when bootstrap has no session', async () => {
    state.auth.bootstrap = null;
    renderCallback();
    await waitFor(() => expect(state.location).toBe('/sign-in?error=google'));
  });
});
