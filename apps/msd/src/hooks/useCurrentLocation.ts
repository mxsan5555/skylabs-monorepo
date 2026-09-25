import { useVisitorLocation } from '../location/location-context';

/**
 * Compatibility wrapper for pages not yet migrated to `useVisitorLocation()` from
 * `location/location-context`. Same `{ location, coords }` shape as before, now fed by the one
 * shared lookup (saved, browser, IP, none) instead of a per-page geolocation + Google geocode call.
 */
export function useCurrentLocation() {
  const { city, coords } = useVisitorLocation();
  return { location: city, coords };
}
