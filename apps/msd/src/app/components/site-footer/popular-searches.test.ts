import { describe, it, expect } from 'vitest';
import { buildPopularSearches } from './popular-searches';

const cats = [
  { id: 'c1', name: 'Massage', slug: 'massage', description: null, children: [] },
  { id: 'c2', name: 'Hair', slug: 'hair', description: null, children: [] },
];
const cities = [
  { state: 'Delhi', city: 'Delhi' },
  { state: 'Maharashtra', city: 'Pune' },
];

describe('buildPopularSearches', () => {
  it('pairs every category with every city as "{category} in {city}" links', () => {
    const out = buildPopularSearches(cats, cities, null);
    expect(out.map((s) => s.label)).toEqual(['Massage in Delhi', 'Hair in Delhi', 'Massage in Pune', 'Hair in Pune']);
    expect(out[2].to).toBe('/category/massage/pune');
  });

  it('puts the visitor city first', () => {
    expect(buildPopularSearches(cats, cities, 'Pune')[0].label).toBe('Massage in Pune');
  });

  it('matches the visitor city case-insensitively', () => {
    expect(buildPopularSearches(cats, cities, 'pune')[0].label).toBe('Massage in Pune');
  });

  it('drops duplicate city names across states', () => {
    const dupes = [
      { state: 'Maharashtra', city: 'Aurangabad' },
      { state: 'Bihar', city: 'Aurangabad' },
    ];
    const out = buildPopularSearches([cats[0]], dupes, null);
    expect(out.map((s) => s.label)).toEqual(['Massage in Aurangabad']);
  });

  it('skips Product and Therapy categories (their city pages cannot filter by city)', () => {
    const typed = [
      { id: 's', name: 'Spa', slug: 'spa', description: null, children: [], type: 'SERVICE' as const },
      { id: 'p', name: 'Serums', slug: 'serums', description: null, children: [], type: 'PRODUCT' as const },
      { id: 't', name: 'Therapy', slug: 'therapy', description: null, children: [], type: 'THERAPY' as const },
      { id: 'n', name: 'Nails', slug: 'nails', description: null, children: [], type: null },
    ];
    const out = buildPopularSearches(typed, [cities[0]], null);
    expect(out.map((s) => s.label)).toEqual(['Spa in Delhi', 'Nails in Delhi']);
  });

  it('caps the list', () => {
    expect(buildPopularSearches(cats, cities, null, 3)).toHaveLength(3);
  });
});
