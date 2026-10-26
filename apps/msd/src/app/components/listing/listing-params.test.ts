import { describe, it, expect } from 'vitest';
import { countText, kindOfCategoryType, pickSort, sortOptionsFor, toIds, toPrice, toRadius, toTags } from './listing-params';
import { dealMapPoints, listingCopy } from './listing-cards';
import content from '../../../content.json';

const UUID = '0a0a0a0a-0000-4000-8000-000000000001';

describe('listing URL parsers', () => {
  it('toPrice keeps non-negative numbers only', () => {
    expect(toPrice('250')).toBe(250);
    expect(toPrice('-1')).toBeUndefined();
    expect(toPrice('abc')).toBeUndefined();
    expect(toPrice('')).toBeUndefined();
  });

  it('toRadius keeps only the offered distances', () => {
    expect(toRadius('10')).toBe(10);
    expect(toRadius('7')).toBeUndefined();
  });

  it('toIds drops anything that is not a UUID', () => {
    expect(toIds(`${UUID},nope`)).toEqual([UUID]);
    expect(toIds(null)).toEqual([]);
  });

  it('toTags drops unknown tags', () => {
    expect(toTags('hot,foo,new')).toEqual(['hot', 'new']);
  });
});

describe('sorts per kind', () => {
  it('pickSort ignores relevance and sorts the kind does not offer', () => {
    expect(pickSort('price_asc', ['relevance', 'price_asc'])).toBe('price_asc');
    expect(pickSort('relevance', ['relevance'])).toBeUndefined();
    expect(pickSort('discount', ['relevance', 'price_asc'])).toBeUndefined();
  });

  it('offers Distance only with coordinates, and products their own sorts in order', () => {
    const labels = content.category.sortOptions;
    expect(sortOptionsFor('deals', false, labels).map((o) => o.value)).toEqual(['relevance', 'price_asc', 'price_desc']);
    expect(sortOptionsFor('deals', true, labels).map((o) => o.value)).toContain('distance');
    expect(sortOptionsFor('products', true, labels).map((o) => o.value)).toEqual(['relevance', 'newest', 'price_asc', 'price_desc', 'discount']);
  });
});

describe('kindOfCategoryType', () => {
  it('maps category types to listing kinds, untyped legacy categories to deals', () => {
    expect(kindOfCategoryType('PRODUCT')).toBe('products');
    expect(kindOfCategoryType('THERAPY')).toBe('therapists');
    expect(kindOfCategoryType('SERVICE')).toBe('deals');
    expect(kindOfCategoryType(null)).toBe('deals');
  });
});

describe('countText', () => {
  it('is empty while loading and picks singular or plural', () => {
    const noun = { singular: 'deal', plural: 'deals' };
    expect(countText('loading', 3, noun)).toBe('');
    expect(countText('ready', 1, noun)).toBe('1 deal');
    expect(countText('ready', 0, noun)).toBe('0 deals');
  });
});

describe('listingCopy', () => {
  it('names each kind in its loading, error and empty copy', () => {
    expect(listingCopy('products').empty).toEqual(content.listingPages.products.empty);
    expect(listingCopy('therapists').empty).toEqual(content.category.emptyTherapists);
    expect(listingCopy('deals').loading).not.toEqual(listingCopy('products').loading);
    expect(listingCopy('therapists').loadError).not.toEqual(listingCopy('deals').loadError);
  });
});

describe('dealMapPoints', () => {
  it('maps only deals whose branch has coordinates', () => {
    const points = dealMapPoints([
      { id: 'a', title: 'A', salePrice: '999', branch: { latitude: '18.5', longitude: '73.8' } },
      { id: 'b', title: 'B', salePrice: '499', branch: { latitude: null, longitude: null } },
    ] as never);
    expect(points).toEqual([{ id: 'a', lat: 18.5, lng: 73.8, label: expect.stringContaining('999'), title: 'A', href: '/deal/a' }]);
  });
});
