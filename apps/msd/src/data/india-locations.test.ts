import { describe, it, expect } from 'vitest';
import { INDIA_LOCATIONS, STATES, citiesForState } from './india-locations';

/**
 * Feature: Static India States/Cities dataset
 * Scenario: citiesForState() cascading lookup used by Branch creation (Step 2 of the vendor
 * wizard) and the public Explore location filter's State -> City picker.
 *
 * Given: a static list of Indian states/UTs, each with its own list of major cities
 * When: citiesForState(state) is called
 * Then: it returns exactly that state's cities, never another state's, and never mutates
 *       the underlying dataset
 *
 * Edge cases:
 * - unknown/garbage state string -> empty array, not undefined/throw
 * - empty string -> empty array
 * - case-sensitive mismatch -> empty array (no fuzzy matching promised)
 */
describe('citiesForState', () => {
  it('returns the correct subset of cities for a known state (happy path)', () => {
    expect(citiesForState('Maharashtra')).toEqual([
      'Mumbai',
      'Pune',
      'Nagpur',
      'Nashik',
      'Thane',
      'Aurangabad',
    ]);
  });

  it('returns a different, non-overlapping subset for another known state', () => {
    const kerala = citiesForState('Kerala');
    const maharashtra = citiesForState('Maharashtra');
    expect(kerala).toEqual(['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur']);
    // No cross-contamination between two different states' city lists.
    expect(kerala.some((city) => maharashtra.includes(city))).toBe(false);
  });

  it('returns every state exactly once in STATES, matching INDIA_LOCATIONS length', () => {
    expect(STATES.length).toBe(INDIA_LOCATIONS.length);
    expect(new Set(STATES).size).toBe(STATES.length);
    expect(STATES).toContain('Delhi');
    expect(STATES).toContain('Karnataka');
  });

  // Edge case: unknown state
  it('returns an empty array for a state that does not exist in the dataset', () => {
    expect(citiesForState('Atlantis')).toEqual([]);
  });

  // Edge case: empty string
  it('returns an empty array for an empty string', () => {
    expect(citiesForState('')).toEqual([]);
  });

  // Edge case: boundary / case sensitivity — no fuzzy/loose matching
  it('does not fuzzy-match on case', () => {
    expect(citiesForState('maharashtra')).toEqual([]);
    expect(citiesForState('MAHARASHTRA')).toEqual([]);
  });

  it('returns a small union-territory state with exactly one city (boundary: minimal list)', () => {
    expect(citiesForState('Sikkim')).toEqual(['Gangtok']);
  });
});
