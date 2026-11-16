import { apiGet, ApiRequestError } from './client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  getTokenStore: () => ({ refresh: refreshMock }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('MSD API auth retry', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('refreshes once and retries an unauthorized API request with the new access token', async () => {
    refreshMock.mockResolvedValue('fresh-access-token');
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { data: null, error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'resource-1' }, error: null }));

    await expect(apiGet('/resource', 'expired-access-token')).resolves.toMatchObject({
      data: { id: 'resource-1' },
    });

    expect(refreshMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      credentials: 'include',
      headers: { Authorization: 'Bearer fresh-access-token' },
    });
  });

  it('does not refresh on a permission-denied response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(403, { data: null, error: { code: 'FORBIDDEN', message: 'Denied' } }),
    );

    await expect(apiGet('/resource', 'valid-access-token')).rejects.toBeInstanceOf(ApiRequestError);
    expect(refreshMock).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
