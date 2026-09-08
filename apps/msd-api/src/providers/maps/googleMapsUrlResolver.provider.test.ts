import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.mock` calls are hoisted above all imports — mirrors this repo's own convention for mocking
// axios-backed providers (see `vendors.routes.test.ts`'s mock of this same resolver at the route
// layer). Here we mock the raw `axios` module itself so the resolver's actual redirect-following/
// coordinate-extraction/validation logic runs for real, with only the network boundary faked.
vi.mock('axios', () => {
  const get = vi.fn();
  const isAxiosError = vi.fn();
  return { default: { get, isAxiosError }, get, isAxiosError };
});

import axios from 'axios';
import { resolveGoogleMapsLocation } from './googleMapsUrlResolver.provider';
import { ApiError } from '../../lib/http';

const mockGet = vi.mocked(axios.get);
const mockIsAxiosError = vi.mocked(axios.isAxiosError);

/** A minimal fake axios response — only the fields the resolver actually reads. */
function okResponse() {
  return { status: 200, headers: {}, data: '' };
}
function redirectResponse(location: string, status = 302) {
  return { status, headers: { location }, data: '' };
}
function axiosLikeError(overrides: { code?: string; message: string }) {
  return Object.assign(new Error(overrides.message), { isAxiosError: true, code: overrides.code });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Realistic default: only errors actually built by `axiosLikeError` above look like axios errors.
  mockIsAxiosError.mockImplementation((e: unknown) => Boolean(e && typeof e === 'object' && 'isAxiosError' in e));
});

const SHORT_LINK = 'https://maps.app.goo.gl/o3WNRifqzdctDuiF9';

describe('resolveGoogleMapsLocation — happy path', () => {
  it('follows a 302 redirect from a short link then extracts !3d/!4d coordinates from the final URL', async () => {
    const finalUrl = 'https://www.google.com/maps/place/Golghar/@28.5871727,77.3166606,17z/data=!3d28.5871727!4d77.3166606';
    mockGet
      .mockResolvedValueOnce(redirectResponse(finalUrl))
      .mockResolvedValueOnce(okResponse());

    const result = await resolveGoogleMapsLocation(SHORT_LINK);

    expect(result).toEqual({ latitude: 28.5871727, longitude: 77.3166606 });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, SHORT_LINK, expect.objectContaining({ maxRedirects: 0 }));
    expect(mockGet).toHaveBeenNthCalledWith(2, finalUrl, expect.objectContaining({ maxRedirects: 0 }));
  });
});

describe('resolveGoogleMapsLocation — coordinate-pattern priority ordering', () => {
  it('prefers !3d/!4d (the pinned place marker) over @lat,lng (the viewport center) when both are present', async () => {
    // A single-hop URL that already contains BOTH patterns — @10,20 (viewport) and !3d30!4d40
    // (the actual pinned place). If priority were ever accidentally reversed, this would resolve
    // to {10, 20} instead of the correct {30, 40}.
    const url = 'https://www.google.com/maps/@10.0,20.0,15z/data=!3d30.0!4d40.0';
    mockGet.mockResolvedValueOnce(okResponse());

    const result = await resolveGoogleMapsLocation(url);

    expect(result).toEqual({ latitude: 30.0, longitude: 40.0 });
  });
});

describe('resolveGoogleMapsLocation — individual fallback patterns', () => {
  it('matches q=lat,lng when no !3d/!4d pattern is present', async () => {
    const url = 'https://www.google.com/maps?q=12.34,56.78';
    mockGet.mockResolvedValueOnce(okResponse());
    const result = await resolveGoogleMapsLocation(url);
    expect(result).toEqual({ latitude: 12.34, longitude: 56.78 });
  });

  it('matches query=lat,lng when no !3d/!4d pattern is present', async () => {
    const url = 'https://www.google.com/maps?query=12.34,56.78';
    mockGet.mockResolvedValueOnce(okResponse());
    const result = await resolveGoogleMapsLocation(url);
    expect(result).toEqual({ latitude: 12.34, longitude: 56.78 });
  });

  it('matches ll=lat,lng when no higher-priority pattern is present', async () => {
    const url = 'https://www.google.com/maps?ll=12.34,56.78&z=15';
    mockGet.mockResolvedValueOnce(okResponse());
    const result = await resolveGoogleMapsLocation(url);
    expect(result).toEqual({ latitude: 12.34, longitude: 56.78 });
  });

  it('matches a bare @lat,lng when no other pattern is present', async () => {
    const url = 'https://www.google.com/maps/@12.34,56.78,15z';
    mockGet.mockResolvedValueOnce(okResponse());
    const result = await resolveGoogleMapsLocation(url);
    expect(result).toEqual({ latitude: 12.34, longitude: 56.78 });
  });
});

describe('resolveGoogleMapsLocation — rejected before any network call', () => {
  it('rejects a malformed URL', async () => {
    await expect(resolveGoogleMapsLocation('not-a-url')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rejects a non-Google host', async () => {
    await expect(resolveGoogleMapsLocation('https://evil.com/maps/@1,2')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rejects a google.com URL whose path is not /maps', async () => {
    await expect(resolveGoogleMapsLocation('https://www.google.com/search?q=x')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('resolveGoogleMapsLocation — SSRF guard on redirect hops', () => {
  it('rejects when a redirect hop points at a disallowed host, without following it', async () => {
    mockGet.mockResolvedValueOnce(redirectResponse('https://evil.com/steal-me'));

    await expect(resolveGoogleMapsLocation(SHORT_LINK)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    // Only the first hop is ever requested — the disallowed redirect target is never fetched.
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe('resolveGoogleMapsLocation — redirect limit', () => {
  it('rejects with the "could not resolve" message after exceeding the max redirect hops', async () => {
    // Every hop redirects to another allowed host — never terminates in a 2xx, so the loop must
    // hit its own MAX_REDIRECTS guard rather than looping forever.
    mockGet.mockResolvedValue(redirectResponse('https://www.google.com/maps/@1,2,3z'));

    await expect(resolveGoogleMapsLocation(SHORT_LINK)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringMatching(/couldn't resolve/i),
    });
    // MAX_REDIRECTS = 5 — hops 0..4 each make one request; the 6th iteration (hop === 5) throws
    // before ever calling axios.get again.
    expect(mockGet).toHaveBeenCalledTimes(5);
  });
});

describe('resolveGoogleMapsLocation — timeout', () => {
  it('rejects with the timeout message when the request times out', async () => {
    mockGet.mockRejectedValueOnce(axiosLikeError({ code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' }));

    await expect(resolveGoogleMapsLocation(SHORT_LINK)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringMatching(/took too long/i),
    });
  });
});

describe('resolveGoogleMapsLocation — no coordinates found', () => {
  it('rejects with the "could not find a location" message when the final URL has no coordinate pattern', async () => {
    const url = 'https://www.google.com/maps/search/massage+near+me';
    mockGet.mockResolvedValueOnce(okResponse());

    await expect(resolveGoogleMapsLocation(url)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringMatching(/could not find a location/i),
    });
  });
});

describe('resolveGoogleMapsLocation — coordinates out of range', () => {
  it('rejects when the extracted latitude/longitude are outside valid ranges', async () => {
    const url = 'https://www.google.com/maps/place/x/data=!3d200.0!4d500.0';
    mockGet.mockResolvedValueOnce(okResponse());

    await expect(resolveGoogleMapsLocation(url)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringMatching(/not valid/i),
    });
  });
});

describe('resolveGoogleMapsLocation — error shape discipline', () => {
  it('every rejection is an ApiError with code VALIDATION_ERROR', async () => {
    await expect(resolveGoogleMapsLocation('not-a-url')).rejects.toBeInstanceOf(ApiError);
  });

  it('never leaks the raw axios/network error message into the thrown ApiError', async () => {
    const secretDetail = 'ECONNRESET at 10.0.0.1:443 socket hang up';
    mockGet.mockRejectedValueOnce(axiosLikeError({ code: 'ECONNRESET', message: secretDetail }));

    try {
      await resolveGoogleMapsLocation(SHORT_LINK);
      expect.unreachable('resolveGoogleMapsLocation should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).not.toContain(secretDetail);
      expect((err as ApiError).message).not.toContain('ECONNRESET');
    }
  });
});
