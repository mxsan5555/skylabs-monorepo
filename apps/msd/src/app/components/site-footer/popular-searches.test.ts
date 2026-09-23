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

  it('caps the list', () => {
    expect(buildPopularSearches(cats, cities, null, 3)).toHaveLength(3);
  });
});
