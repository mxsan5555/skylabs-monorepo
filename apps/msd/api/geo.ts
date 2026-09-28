import { parseGeoHeaders } from '../src/location/geo';

/** GET /api/geo: the visitor's approximate location from Vercel's IP headers, or null.
 *  No third-party service, no API key. Returns null outside Vercel (no headers). */
export function GET(request: Request): Response {
  return Response.json(parseGeoHeaders(request.headers), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
