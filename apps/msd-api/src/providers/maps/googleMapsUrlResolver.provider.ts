import axios from 'axios';
import { ApiError } from '../../lib/http';

/**
 * Resolves a Google Maps share URL (short link like `https://maps.app.goo.gl/...` or a full
 * `google.com/maps/...` URL) into a `{ latitude, longitude }` pair, server-side, with no Google
 * API key/billing involved — mirrors `providers/sms/connectExpress.provider.ts`'s shape (direct
 * axios, try/catch, structured console logging, timeouts) but adds a manual redirect loop
 * because we must validate the HOST of every hop (not just the final one) against an allowlist
 * before following it, so a compromised/malicious short-link can never be used to make this
 * server issue a request to an arbitrary internal/external host (SSRF).
 */

const ALLOWED_EXACT_HOSTS = new Set(['maps.app.goo.gl']);
const ALLOWED_MAPS_PATH_HOSTS = new Set(['google.com', 'www.google.com', 'maps.google.com']);

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 8_000;

const GENERIC_FAILURE_MESSAGE =
  "We couldn't read a location from that Google Maps link. Please check the link and try again.";

/** Priority-ordered: the first pattern that matches wins (see file-level doc for why `!3d/!4d`
 *  — the actual pinned place marker — must be tried before `@lat,lng` — the map viewport/camera
 *  center, which is frequently a different, less precise coordinate for the same shared link). */
const COORDINATE_PATTERNS: RegExp[] = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  /[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
];

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  return ALLOWED_MAPS_PATH_HOSTS.has(host);
}

/** `google.com`/`www.google.com`/`maps.google.com` additionally require a `/maps` path — a bare
 *  `google.com/search?...` must be rejected even though the host matches. */
function isAllowedUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  if (ALLOWED_MAPS_PATH_HOSTS.has(host)) return url.pathname.startsWith('/maps');
  return false;
}

function extractCoordinates(finalUrl: string): { latitude: number; longitude: number } | null {
  for (const pattern of COORDINATE_PATTERNS) {
    const match = finalUrl.match(pattern);
    if (!match) continue;
    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    return { latitude, longitude };
  }
  return null;
}

/**
 * Resolves a Google Maps URL to its place coordinates. Every failure path throws a clean
 * `ApiError('VALIDATION_ERROR', ...)` with a user-facing message — the underlying axios error,
 * HTML body, or stack trace is only ever logged via `console.error`, never surfaced to the client.
 */
export async function resolveGoogleMapsLocation(url: string): Promise<{ latitude: number; longitude: number }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    console.error(`[maps:googleMapsUrlResolver] malformed URL url=${url} error=${(err as Error).message}`);
    throw new ApiError('VALIDATION_ERROR', 'That does not look like a valid URL. Please paste a Google Maps link.');
  }

  if (!isAllowedUrl(parsed)) {
    console.error(`[maps:googleMapsUrlResolver] disallowed host url=${url} host=${parsed.hostname}`);
    throw new ApiError(
      'VALIDATION_ERROR',
      'That is not a supported Google Maps URL. Please paste a link from Google Maps (e.g. maps.app.goo.gl or google.com/maps).',
    );
  }

  let currentUrl = parsed.toString();
  let finalUrl: string | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (hop === MAX_REDIRECTS) {
      console.error(`[maps:googleMapsUrlResolver] redirect limit exceeded url=${url} lastHop=${currentUrl}`);
      throw new ApiError('VALIDATION_ERROR', "We couldn't resolve this Google Maps link. Please check the link and try again.");
    }

    let response;
    try {
      response = await axios.get(currentUrl, {
        maxRedirects: 0,
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });
    } catch (err) {
      if (axios.isAxiosError(err) && (err.code === 'ECONNABORTED' || /timeout/i.test(err.message))) {
        console.error(
          `[maps:googleMapsUrlResolver] request timed out url=${url} hop=${hop} currentUrl=${currentUrl} error=${err.message}`,
        );
        throw new ApiError('VALIDATION_ERROR', 'The Google Maps link took too long to resolve. Please try again.');
      }
      if (axios.isAxiosError(err)) {
        console.error(
          `[maps:googleMapsUrlResolver] request FAILED url=${url} hop=${hop} currentUrl=${currentUrl} code=${err.code ?? 'n/a'} message=${err.message}`,
        );
      } else {
        console.error(
          `[maps:googleMapsUrlResolver] request FAILED url=${url} hop=${hop} currentUrl=${currentUrl} error=${(err as Error).message}`,
        );
      }
      throw new ApiError('VALIDATION_ERROR', GENERIC_FAILURE_MESSAGE);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers['location'] as string | undefined;
      if (!location) {
        console.error(
          `[maps:googleMapsUrlResolver] redirect with no location header url=${url} hop=${hop} currentUrl=${currentUrl} status=${response.status}`,
        );
        throw new ApiError('VALIDATION_ERROR', "We couldn't resolve this Google Maps link. Please check the link and try again.");
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch (err) {
        console.error(
          `[maps:googleMapsUrlResolver] malformed redirect location url=${url} hop=${hop} location=${location} error=${(err as Error).message}`,
        );
        throw new ApiError('VALIDATION_ERROR', "We couldn't resolve this Google Maps link. Please check the link and try again.");
      }
      if (!isAllowedHost(nextUrl.hostname)) {
        console.error(
          `[maps:googleMapsUrlResolver] redirect to disallowed host url=${url} hop=${hop} nextHost=${nextUrl.hostname}`,
        );
        throw new ApiError(
          'VALIDATION_ERROR',
          'That is not a supported Google Maps URL. Please paste a link from Google Maps (e.g. maps.app.goo.gl or google.com/maps).',
        );
      }
      currentUrl = nextUrl.toString();
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      console.error(
        `[maps:googleMapsUrlResolver] non-2xx final response url=${url} hop=${hop} currentUrl=${currentUrl} status=${response.status}`,
      );
      throw new ApiError('VALIDATION_ERROR', GENERIC_FAILURE_MESSAGE);
    }

    finalUrl = currentUrl;
    break;
  }

  if (!finalUrl) {
    console.error(`[maps:googleMapsUrlResolver] no final URL resolved url=${url}`);
    throw new ApiError('VALIDATION_ERROR', GENERIC_FAILURE_MESSAGE);
  }

  const coords = extractCoordinates(finalUrl);
  if (!coords) {
    console.error(`[maps:googleMapsUrlResolver] no coordinate pattern matched url=${url} finalUrl=${finalUrl}`);
    throw new ApiError('VALIDATION_ERROR', 'We could not find a location in that Google Maps link. Please check the link and try again.');
  }

  const { latitude, longitude } = coords;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    console.error(
      `[maps:googleMapsUrlResolver] coordinates out of range url=${url} finalUrl=${finalUrl} latitude=${latitude} longitude=${longitude}`,
    );
    throw new ApiError('VALIDATION_ERROR', 'The location found in that Google Maps link is not valid. Please check the link and try again.');
  }

  console.info(`[maps:googleMapsUrlResolver] resolved url=${url} finalUrl=${finalUrl} latitude=${latitude} longitude=${longitude}`);
  return { latitude, longitude };
}
