import { HttpError } from '../middleware/errorHandler';

/** Explicit full-address geocoding, not a paid per-keystroke autocomplete. */
export async function searchLocation(address: string) {
  if (address.trim().length < 3 || address.length > 200) throw new HttpError(422, 'ADDRESS_INVALID', 'Enter an address between 3 and 200 characters');
  const key = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  if (!key) throw new HttpError(503, 'LOCATION_NOT_CONFIGURED', 'Address lookup is unavailable. Enter your address and select the state manually.');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address.trim());
  url.searchParams.set('key', key);
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' }); }
  catch { throw new HttpError(502, 'LOCATION_PROVIDER_UNAVAILABLE', 'Address lookup failed. Manual address selection remains available.'); }
  if (!response.ok) throw new HttpError(502, 'LOCATION_PROVIDER_UNAVAILABLE', 'Address lookup failed. Manual address selection remains available.');
  let payload: any;
  try { payload = await response.json(); } catch { throw new HttpError(502, 'LOCATION_RESPONSE_INVALID', 'Address lookup returned an invalid response'); }
  if (payload.status === 'ZERO_RESULTS') return [];
  if (payload.status !== 'OK' || !Array.isArray(payload.results)) throw new HttpError(502, 'LOCATION_RESPONSE_INVALID', 'Address lookup could not confirm a location');
  return payload.results.slice(0, 5).flatMap((item: any) => {
    const { lat, lng } = item.geometry?.location ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || typeof item.formatted_address !== 'string' || typeof item.place_id !== 'string') return [];
    const component = (type: string) => item.address_components?.find((entry: any) => entry.types?.includes(type))?.long_name;
    return [{ name: item.formatted_address, address: item.formatted_address, placeId: item.place_id, lat, lng, city: component('locality'), state: component('administrative_area_level_1') }];
  });
}
