import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth, type AuthContextValue } from './auth-context';

/**
 * P10-38: sign-out clears every token and the bootstrap and revokes the refresh token on the
 * server; a "Login As" preview token lives only in this tab (sessionStorage) and never replaces
 * the real token in localStorage.
 */
const API = 'http://api.test';
const KEYS = {
  token: 'app_auth_token',
  refresh: 'app_auth_refresh_token',
  real: 'app_auth_real_token',
  preview: 'app_auth_preview_token',
};

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const REAL = jwt({ sub: 'admin', exp: inAnHour() });
const PREVIEW = jwt({ sub: 'member', isPreview: true, exp: inAnHour() });
const BOOTSTRAP = { user: { id: 'admin' }, roles: [], permissions: [], menu: [], dashboardWidgets: [] };

let auth: AuthContextValue;
function Probe() {
  auth = useAuth();
  return <p data-testid="token">{auth.token ?? 'none'}</p>;
}
const renderAuth = () =>
  render(
    <AuthProvider appPrefix="app" apiBaseUrl={API}>
      <Probe />
    </AuthProvider>,
  );

const fetchMock = vi.fn();
const ok = (data: unknown) => Promise.resolve(new Response(JSON.stringify({ data }), { status: 200 }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/rbac/bootstrap')) {
      const bearer = new Headers(init?.headers).get('Authorization');
      return bearer?.includes('.') ? ok(BOOTSTRAP) : Promise.resolve(new Response('', { status: 401 }));
    }
    if (url.endsWith('/rbac/impersonate')) return ok({ previewToken: PREVIEW });
    if (url.endsWith('/auth/logout')) return ok({ message: 'Logged out' });
    return Promise.resolve(new Response('', { status: 404 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('AuthProvider sign-out (P10-38)', () => {
  it('revokes the refresh token on the server and clears tokens, preview and bootstrap', async () => {
    localStorage.setItem(KEYS.token, REAL);
    localStorage.setItem(KEYS.refresh, 'refresh-1');
    sessionStorage.setItem(KEYS.preview, PREVIEW);
    renderAuth();
    await waitFor(() => expect(auth.bootstrap).not.toBeNull());

    act(() => auth.signOut());

    expect(screen.getByTestId('token').textContent).toBe('none');
    expect(auth.bootstrap).toBeNull();
    for (const key of [KEYS.token, KEYS.refresh, KEYS.real]) expect(localStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(KEYS.preview)).toBeNull();
    const logout = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logout?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ refreshToken: 'refresh-1' }) });
    expect(new Headers(logout?.[1]?.headers).get('Authorization')).toBe(`Bearer ${REAL}`);
  });

  it('still signs out locally when the server call fails', async () => {
    localStorage.setItem(KEYS.token, REAL);
    localStorage.setItem(KEYS.refresh, 'refresh-1');
    renderAuth();
    await waitFor(() => expect(auth.bootstrap).not.toBeNull());
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    act(() => auth.signOut());
    expect(screen.getByTestId('token').textContent).toBe('none');
    expect(localStorage.getItem(KEYS.refresh)).toBeNull();
  });
});

describe('AuthProvider "Login As" preview (P10-38)', () => {
  beforeEach(() => {
    localStorage.setItem(KEYS.token, REAL);
    localStorage.setItem(KEYS.refresh, 'refresh-1');
  });

  it('keeps the preview token in this tab only; localStorage keeps the real token', async () => {
    renderAuth();
    await waitFor(() => expect(auth.bootstrap).not.toBeNull());
    await act(() => auth.loginAsUser('member'));

    expect(screen.getByTestId('token').textContent).toBe(PREVIEW);
    expect(sessionStorage.getItem(KEYS.preview)).toBe(PREVIEW);
    expect(localStorage.getItem(KEYS.token)).toBe(REAL);
    expect(localStorage.getItem(KEYS.real)).toBeNull();
  });

  it('a reload in the same tab resumes the preview; a new tab (empty sessionStorage) gets the real session', async () => {
    sessionStorage.setItem(KEYS.preview, PREVIEW);
    const { unmount } = renderAuth();
    expect(screen.getByTestId('token').textContent).toBe(PREVIEW);
    unmount();

    sessionStorage.clear();
    renderAuth();
    expect(screen.getByTestId('token').textContent).toBe(REAL);
  });

  it('returning to Super Admin drops the preview and restores the real token', async () => {
    sessionStorage.setItem(KEYS.preview, PREVIEW);
    renderAuth();
    await act(() => auth.returnToSuperAdmin());
    expect(screen.getByTestId('token').textContent).toBe(REAL);
    expect(sessionStorage.getItem(KEYS.preview)).toBeNull();
  });

  it('an expired preview is dropped on load instead of signing the Super Admin out', async () => {
    sessionStorage.setItem(KEYS.preview, jwt({ sub: 'member', isPreview: true, exp: 1 }));
    renderAuth();
    expect(screen.getByTestId('token').textContent).toBe(REAL);
    expect(sessionStorage.getItem(KEYS.preview)).toBeNull();
  });

  it('clears a preview token left in localStorage by an older version and restores the real one', async () => {
    localStorage.setItem(KEYS.token, PREVIEW);
    localStorage.setItem(KEYS.real, REAL);
    renderAuth();
    expect(screen.getByTestId('token').textContent).toBe(REAL);
    expect(localStorage.getItem(KEYS.token)).toBe(REAL);
    expect(localStorage.getItem(KEYS.real)).toBeNull();
  });
});
