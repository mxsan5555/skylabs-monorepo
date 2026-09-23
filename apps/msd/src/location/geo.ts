export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoResult {
  city: string;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
}

const toNumber = (value: string | null): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** decodeURIComponent throws on malformed input (e.g. a stray `%`); fall back to the raw value. */
const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Vercel adds these headers to every request (values are URI-encoded). */
export function parseGeoHeaders(headers: Headers): GeoResult | null {
  const rawCity = headers.get('x-vercel-ip-city');
  if (!rawCity) return null;
  const rawRegion = headers.get('x-vercel-ip-country-region');
  return {
    city: safeDecode(rawCity),
    region: rawRegion == null ? null : safeDecode(rawRegion),
    latitude: toNumber(headers.get('x-vercel-ip-latitude')),
    longitude: toNumber(headers.get('x-vercel-ip-longitude')),
  };
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Any city record with optional coordinates (structurally matches `CatalogLocation`). Kept
 *  local so this file has no app imports and can be bundled into the Vercel function. */
export interface CityPoint {
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}

export function nearestCity<T extends CityPoint>(point: Coordinates, cities: T[]): T | null {
  let best: T | null = null;
  let bestKm = Infinity;
  for (const c of cities) {
    if (c.latitude == null || c.longitude == null) continue;
    const km = haversineKm(point, { latitude: c.latitude, longitude: c.longitude });
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}
