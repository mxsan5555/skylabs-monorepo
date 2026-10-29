import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
import { AuthProvider, useAuth } from './auth-context';

/**
 * Regression coverage for "stale/shared permissions across logins" (investigated 2026-10-26):
 * when a different user signs in, `bootstrap` (and therefore the sidebar it feeds) must reflect
 * THAT user's fresh server response, never a cached/previous user's data; signing out must clear
 * it to null rather than leaving the last user's menu visible.
 */

const fakeStore = {
  current: null as string | null,
  listeners: new Set<(token: string | null) => void>(),
  getToken: () => fakeStore.current,
  setToken: (t: string | null) => {
    fakeStore.current = t;
    fakeStore.listeners.forEach((l) => l(t));
  },
  subscribe: (l: (token: string | null) => void) => {
    fakeStore.listeners.add(l);
    return () => fakeStore.listeners.delete(l);
  },
  refresh: vi.fn().mockResolvedValue(null),
  logout: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./token-store', () => ({ getTokenStore: () => fakeStore }));

const fetchBootstrapMock = vi.fn();
vi.mock('../index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../index')>()),
  fetchBootstrap: (...args: unknown[]) => fetchBootstrapMock(...args),
}));

function bootstrapFor(userName: string, menuIds: string[]): BootstrapResponse {
  return {
    user: { id: userName, name: userName, status: 'active' },
    roles: [{ id: 'r1', key: userName, name: userName, isSuperAdmin: false }],
    permissions: [],
    scopes: {},
    menu: menuIds.map((id, order) => ({ id, title: id, icon: 'x', permissionKey: id, parent: null, order })),
    dashboardWidgets: [],
  } as unknown as BootstrapResponse;
}

function TestConsumer() {
  const { bootstrap, loading, signIn, signOut } = useAuth();
  return (
    <div>
      <p data-testid="loading">{String(loading)}</p>
      <p data-testid="menu">{bootstrap ? bootstrap.menu.map((n) => n.id).join(',') : 'none'}</p>
      <button type="button" onClick={() => signIn('marketing-token')}>sign-in-marketing</button>
      <button type="button" onClick={() => signIn('sales-token')}>sign-in-sales</button>
      <button type="button" onClick={signOut}>sign-out</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider appPrefix="test" apiBaseUrl="http://api.test">
      <TestConsumer />
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeStore.current = null;
  fakeStore.listeners.clear();
  fakeStore.refresh.mockResolvedValue(null);
  fetchBootstrapMock.mockImplementation((_apiBaseUrl: string, token: string) => {
    if (token === 'marketing-token') return Promise.resolve(bootstrapFor('marketing', ['dashboard', 'cms']));
    if (token === 'sales-token') return Promise.resolve(bootstrapFor('sales', ['dashboard', 'customers', 'orders']));
    return Promise.reject(new Error(`unexpected token ${token}`));
  });
});

describe('AuthProvider — bootstrap reflects the current signed-in user, never a stale one', () => {
  it('starts signed out: loading resolves to false and bootstrap is null with no token to refresh', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('menu').textContent).toBe('none');
  });

  it("signing in as Marketing loads exactly Marketing's menu", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    fireEvent.click(screen.getByText('sign-in-marketing'));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('dashboard,cms'));
  });

  it("switching from Marketing to Sales (sign out, then sign in as a different user) replaces the menu entirely — no leftover Marketing items", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    fireEvent.click(screen.getByText('sign-in-marketing'));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('dashboard,cms'));

    fireEvent.click(screen.getByText('sign-out'));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('none'));

    fireEvent.click(screen.getByText('sign-in-sales'));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('dashboard,customers,orders'));
    // The old Marketing-only node must not survive the switch.
    expect(screen.getByTestId('menu').textContent).not.toContain('cms');
  });

  it('a failed bootstrap fetch (expired/invalid token) clears bootstrap rather than leaving a stale menu visible', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    fireEvent.click(screen.getByText('sign-in-sales'));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('dashboard,customers,orders'));

    const { AuthRequestError } = await import('../index');
    fetchBootstrapMock.mockRejectedValueOnce(new AuthRequestError('expired', 401));
    fireEvent.click(screen.getByText('sign-in-marketing'));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('none'));
  });

  it('a proactive token refresh silently reloads bootstrap — an already-open session picks up a Role Permission Matrix change without a full-page loading flash', async () => {
    // A real JWT shape (unlike this file's other plain string test tokens) so
    // `msUntilJwtExpiry` computes a real, deterministic delay instead of firing immediately —
    // exp is 65s out, default 60s leeway, so the proactive-refresh timer fires ~5s from sign-in,
    // comfortably after the sign-in's own (non-silent) bootstrap load has already settled.
    const b64url = (obj: object) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_');
    const initialToken = `h.${b64url({ exp: Math.floor(Date.now() / 1000) + 65 })}.s`;
    const refreshedToken = 'marketing-token-v2';

    fetchBootstrapMock.mockImplementation((_apiBaseUrl: string, token: string) => {
      if (token === initialToken) return Promise.resolve(bootstrapFor('marketing', ['dashboard', 'cms']));
      if (token === refreshedToken) {
        return Promise.resolve(bootstrapFor('marketing', ['dashboard', 'cms', 'reports']));
      }
      return Promise.reject(new Error(`unexpected token ${token}`));
    });
    fakeStore.refresh.mockResolvedValue(refreshedToken);

    const loadingHistory: string[] = [];
    function RecordingConsumer() {
      const { bootstrap, loading, signIn } = useAuth();
      loadingHistory.push(String(loading));
      return (
        <div>
          <p data-testid="menu">{bootstrap ? bootstrap.menu.map((n) => n.id).join(',') : 'none'}</p>
          <button type="button" onClick={() => signIn(initialToken)}>sign-in-marketing</button>
        </div>
      );
    }

    render(
      <AuthProvider appPrefix="test" apiBaseUrl="http://api.test">
        <RecordingConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('none'));

    fireEvent.click(screen.getByText('sign-in-marketing'));
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('dashboard,cms'));
    const checkpoint = loadingHistory.length;

    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('dashboard,cms,reports'), {
      timeout: 8000,
    });

    // Silent: every render from the sign-in settling onward must have stayed `loading === false`
    // — a background refresh must never trigger RequireAuth's full-page loading placeholder.
    expect(loadingHistory.slice(checkpoint)).not.toContain('true');
  }, 10000);
});
