/**
 * Coverage for `AuthService`'s token-refresh lifecycle — the fix for the "repeated/unexpected
 * logout shortly after login" bug. Root cause: `AuthService` never stored the refresh token
 * the backend already issues, so an access token expiring (15 min TTL) was an unrecoverable
 * dead end — and a hard reload with an expired token left a "zombie" session (token present,
 * bootstrap never loads) that every permission/ownership guard read as "no access". See
 * `packages/shared-auth/src/angular/auth.service.ts` for the fix itself.
 *
 * Lives here rather than in `packages/shared-auth` for the same reason as
 * `shared-auth-guards.spec.ts` — that package's own test target has no Angular TestBed wiring.
 */
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService, AUTH_CONFIG } from '@skylabs-monorepo/shared-auth/angular';

const API_BASE = 'http://api.test';

/** A well-formed (unsigned) JWT-shaped string — `AuthService` only ever base64-decodes the
 *  payload client-side, it never verifies the signature, so this is sufficient for every
 *  client-side expiry/preview check it makes. */
function makeToken(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

function validToken(extra: Record<string, unknown> = {}) {
  return makeToken({ sub: 'user-1', roles: ['driver'], app: 'mera-driver', exp: Math.floor(Date.now() / 1000) + 3600, ...extra });
}

function expiredToken(extra: Record<string, unknown> = {}) {
  return makeToken({ sub: 'user-1', roles: ['driver'], app: 'mera-driver', exp: Math.floor(Date.now() / 1000) - 60, ...extra });
}

const BOOTSTRAP_BODY = {
  data: {
    user: { id: 'user-1', name: 'Test', email: null, phone: '9000000001', status: 'active' },
    roles: [],
    permissions: [],
    menu: [],
    dashboardWidgets: [],
    driver: null,
  },
};

function jsonRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function configure() {
  TestBed.configureTestingModule({
    providers: [{ provide: AUTH_CONFIG, useValue: { appPrefix: 'test_app', apiBaseUrl: API_BASE } }],
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthService.signIn', () => {
  it('stores both the access token and the refresh token', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) return jsonRes(200, BOOTSTRAP_BODY);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);

    await auth.signIn(validToken(), 'refresh-token-abc');

    expect(localStorage.getItem('test_app_auth_token')).toBeTruthy();
    expect(localStorage.getItem('test_app_auth_refresh_token')).toBe('refresh-token-abc');
    expect(auth.bootstrap()).toEqual(BOOTSTRAP_BODY.data);
  });
});

describe('AuthService constructor — recovering from an expired access token on reload', () => {
  it('auto-refreshes and loads bootstrap when a refresh token is available (no zombie session)', async () => {
    localStorage.setItem('test_app_auth_token', expiredToken());
    localStorage.setItem('test_app_auth_refresh_token', 'stored-refresh-token');

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        return jsonRes(200, { data: { accessToken: validToken(), refreshToken: 'rotated-refresh-token' } });
      }
      if (url.includes('/rbac/bootstrap')) return jsonRes(200, BOOTSTRAP_BODY);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);

    await auth.whenReady();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.bootstrap()).toEqual(BOOTSTRAP_BODY.data);
    expect(localStorage.getItem('test_app_auth_refresh_token')).toBe('rotated-refresh-token');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), expect.anything());
  });

  it('clears the session cleanly when there is no refresh token to recover with', async () => {
    localStorage.setItem('test_app_auth_token', expiredToken());
    // No refresh token stored.
    const fetchMock = vi.fn(async () => {
      throw new Error('no fetch should happen — nothing to recover with');
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);

    await auth.whenReady();

    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.bootstrap()).toBeNull();
    expect(localStorage.getItem('test_app_auth_token')).toBeNull();
  });

  it('clears the session when the refresh token itself is rejected (invalid/expired/revoked)', async () => {
    localStorage.setItem('test_app_auth_token', expiredToken());
    localStorage.setItem('test_app_auth_refresh_token', 'dead-refresh-token');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/auth/refresh')) return jsonRes(401, { error: { message: 'invalid' } });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);

    await auth.whenReady();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('test_app_auth_refresh_token')).toBeNull();
  });
});

describe('AuthService.ensureValidToken — single-flight refresh', () => {
  it('shares one in-flight refresh across concurrent callers instead of issuing N requests', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) return jsonRes(200, BOOTSTRAP_BODY);
      if (url.includes('/auth/refresh')) {
        refreshCalls++;
        return jsonRes(200, { data: { accessToken: validToken(), refreshToken: 'rotated' } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);
    await auth.signIn(validToken(), 'refresh-1');

    const [a, b, c] = await Promise.all([
      auth.ensureValidToken({ force: true }),
      auth.ensureValidToken({ force: true }),
      auth.ensureValidToken({ force: true }),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('does not clear the session on a network failure while refreshing', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) return jsonRes(200, BOOTSTRAP_BODY);
      if (url.includes('/auth/refresh')) throw new TypeError('network error');
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);
    await auth.signIn(validToken(), 'refresh-1');

    const result = await auth.ensureValidToken({ force: true });

    expect(result).toBeNull();
    expect(auth.isAuthenticated()).toBe(true); // token/session untouched — safe to retry later
  });
});

describe('AuthService.signOut', () => {
  it('clears local storage immediately and best-effort revokes the refresh session server-side', async () => {
    localStorage.setItem('test_app_auth_token', validToken());
    localStorage.setItem('test_app_auth_refresh_token', 'refresh-to-revoke');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) return jsonRes(200, BOOTSTRAP_BODY);
      if (url.includes('/auth/logout')) return jsonRes(200, { data: { message: 'ok' } });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);
    await auth.whenReady();

    auth.signOut();

    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('test_app_auth_token')).toBeNull();
    expect(localStorage.getItem('test_app_auth_refresh_token')).toBeNull();
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/logout'), expect.objectContaining({ method: 'POST' })),
    );
  });

  it('does not attempt a server call when there was no refresh token stored', async () => {
    localStorage.setItem('test_app_auth_token', validToken());
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) return jsonRes(200, BOOTSTRAP_BODY);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);
    await auth.whenReady();

    fetchMock.mockClear();
    auth.signOut();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('AuthService.loadBootstrap — transient failures must not sign the user out', () => {
  it('retries once on a transient (non-401/403) failure and keeps the session on success', async () => {
    let bootstrapCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) {
        bootstrapCalls++;
        if (bootstrapCalls === 1) return jsonRes(500, { error: { message: 'temporary' } });
        return jsonRes(200, BOOTSTRAP_BODY);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);

    await auth.signIn(validToken(), 'refresh-1');

    expect(bootstrapCalls).toBe(2);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.bootstrap()).toEqual(BOOTSTRAP_BODY.data);
  });

  it('a 403 from bootstrap ends the session (genuine access failure, not a transient blip)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) return jsonRes(403, { error: { message: 'forbidden' } });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);

    await auth.signIn(validToken(), 'refresh-1');

    expect(auth.isAuthenticated()).toBe(false);
  });

  it('keeps a previously-loaded bootstrap intact if a later refreshBootstrap() call fails transiently twice', async () => {
    const fetchMock = vi.fn(async (url: string) => jsonRes(200, BOOTSTRAP_BODY));
    vi.stubGlobal('fetch', fetchMock);
    configure();
    const auth = TestBed.inject(AuthService);
    await auth.signIn(validToken(), 'refresh-1');
    expect(auth.bootstrap()).toEqual(BOOTSTRAP_BODY.data);

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/rbac/bootstrap')) return jsonRes(500, { error: { message: 'down' } });
      throw new Error(`unexpected fetch: ${url}`);
    });
    await auth.refreshBootstrap();

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.bootstrap()).toEqual(BOOTSTRAP_BODY.data); // stale-but-valid data kept, not wiped
  });
});
