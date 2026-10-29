import { describe, it, expect } from 'vitest';
import type { CatalogVendorBranch } from '../../../api/catalog';
import { resolveBranch } from './vendor';

/**
 * ST-20: the member page reads the visitor's location from `useVisitorLocation()` (the one shared
 * lookup) and shows the branch nearest to it.
 */
const branch = (id: string, latitude: string | null, longitude: string | null) =>
  ({ id, name: id, latitude, longitude }) as unknown as CatalogVendorBranch;

const PUNE = branch('pune', '18.52', '73.85');
const MUMBAI = branch('mumbai', '19.07', '72.87');
const NO_COORDS = branch('unmapped', null, null);

describe('resolveBranch', () => {
  it('picks the branch nearest the visitor', () => {
    expect(resolveBranch([PUNE, MUMBAI], { latitude: 19.0, longitude: 72.8 })?.id).toBe('mumbai');
    expect(resolveBranch([MUMBAI, PUNE], { latitude: 18.5, longitude: 73.9 })?.id).toBe('pune');
  });

  it('falls back to the first branch without a location or without mapped branches', () => {
    expect(resolveBranch([PUNE, MUMBAI], null)?.id).toBe('pune');
    expect(resolveBranch([NO_COORDS, PUNE], null)?.id).toBe('unmapped');
    expect(resolveBranch([NO_COORDS], { latitude: 19, longitude: 72.8 })?.id).toBe('unmapped');
  });

  it('returns null for a member with no branches', () => {
    expect(resolveBranch([], { latitude: 19, longitude: 72.8 })).toBeNull();
  });
});
