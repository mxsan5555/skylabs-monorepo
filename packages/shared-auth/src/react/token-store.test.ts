import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRequestError } from '../index';
import { getTokenStore } from './token-store';

const API_BASE_URL = 'https://api.example.test/api/v1';
let storeNumber = 0;

function response(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  } as Response;
}

function nextStore() {
  storeNumber += 1;
  return getTokenStore(`auth-test-${storeNumber}`, API_BASE_URL);
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('token store refresh', () => {
  it('shares one in-flight refresh between concurrent callers and persists only the access token', async () => {
    let finishRefresh: ((value: Response) => void) | undefined;
    const fetchMock = vi.mocked(fetch);
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, operation: () => Promise<unknown>) => operation(),
      },
    });
    fetchMock.mockImplementation((input) => {
      if (String(input).endsWith('/auth/csrf')) return Promise.resolve(response(200, { csrfToken: 'csrf' }));
      return new Promise((resolve) => {
        finishRefresh = resolve;
      });
    });

    const store = nextStore();
    const first = store.refresh();
    const second = store.refresh();
    await vi.waitFor(() => expect(finishRefresh).toBeTypeOf('function'));
    finishRefresh?.(response(200, { accessToken: 'fresh-access-token' }));

    await expect(Promise.all([first, second])).resolves.toEqual(['fresh-access-token', 'fresh-access-token']);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(localStorage.getItem('auth-test-1_auth_token')).toBe('fresh-access-token');
    expect(localStorage.getItem('auth-test-1_auth_refresh_token')).toBeNull();
  });

  it('preserves the current access token on a transient refresh failure', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response(200, { csrfToken: 'csrf' }))
      .mockResolvedValueOnce(response(503, null));
    const store = nextStore();
    store.setToken('existing-access-token');

    await expect(store.refresh()).rejects.toMatchObject<AuthRequestError>({ status: 503 });
    expect(store.getToken()).toBe('existing-access-token');
  });
});

describe('token store logout', () => {
  it('clears local auth state and revokes the cookie-backed session', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(response(200, { csrfToken: 'csrf' }))
      .mockResolvedValueOnce(response(200, { message: 'Logged out' }));
    const store = nextStore();
    store.setToken('current-access-token');

    await store.logout();

    expect(store.getToken()).toBeNull();
    expect(localStorage.getItem('auth-test-2_auth_token')).toBeNull();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': 'csrf' },
    });
  });
});
