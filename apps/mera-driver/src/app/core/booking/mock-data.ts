import type { Place } from '../../models';

/** Default pickup used until the rider shares their location or searches an address. */
export const DEFAULT_PICKUP: Place = {
  id: 'current',
  label: 'Current location',
  address: 'Koramangala 5th Block, Bengaluru',
  coord: { lat: 12.9352, lng: 77.6245 },
  kind: 'recent',
};
