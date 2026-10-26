import { describe, expect, it } from 'vitest';
import { buildRoutes, isEmptyCityPage, STATIC_PUBLIC_PATHS } from './routes';
import type { ShellData } from '../src/prerender-data/loaders';

const cat = (slug: string, type?: 'SERVICE' | 'PRODUCT' | 'THERAPY' | null) =>
  ({ id: slug, name: slug, slug, description: null, type, children: [] }) as unknown as ShellData['categories'][number];

const shell: ShellData = {
  categories: [cat('massage', 'SERVICE'), cat('spa'), cat('oils', 'PRODUCT'), cat('physio', 'THERAPY')],
  locations: [
    { city: 'Pune', state: 'Maharashtra' },
    { city: 'Navi Mumbai', state: 'Maharashtra' },
    { city: 'pune', state: 'Other' },
  ],
  socialLinks: [],
};

describe('buildRoutes', () => {
  it('returns home, every category, every deal-category x unique city, then the listing pages', () => {
    expect(buildRoutes(shell).map((r) => r.path)).toEqual([
      '/',
      '/category/massage',
      '/category/spa',
      '/category/oils',
      '/category/physio',
      '/category/massage/pune',
      '/category/massage/navi-mumbai',
      '/category/spa/pune',
      '/category/spa/navi-mumbai',
      '/deals',
      '/products',
      '/therapists',
      '/deals/pune',
      '/deals/navi-mumbai',
      '/therapists/pune',
      '/therapists/navi-mumbai',
    ]);
  });

  it('marks listing routes with their kind and city (ST-42)', () => {
    const routes = buildRoutes(shell);
    expect(routes.find((r) => r.path === '/products')).toEqual({ path: '/products', listing: 'products' });
    expect(routes.find((r) => r.path === '/therapists/pune')).toEqual({ path: '/therapists/pune', listing: 'therapists', city: 'Pune', state: 'Maharashtra' });
  });

  it('keeps the first location for a duplicate city slug and carries its name and state', () => {
    const route = buildRoutes(shell).find((r) => r.path === '/category/massage/pune');
    expect(route).toEqual({ path: '/category/massage/pune', slug: 'massage', city: 'Pune', state: 'Maharashtra' });
  });

  it('returns only home for an empty shell', () => {
    expect(buildRoutes({ categories: [], locations: [], socialLinks: [] })).toEqual([
      { path: '/' },
      { path: '/deals', listing: 'deals' },
      { path: '/products', listing: 'products' },
      { path: '/therapists', listing: 'therapists' },
    ]);
  });
});

describe('isEmptyCityPage', () => {
  const route = { path: '/category/massage/pune', slug: 'massage', city: 'Pune', state: 'Maharashtra' };
  it('is true for a city route with no deals', () => {
    expect(isEmptyCityPage(route, { deals: [] })).toBe(true);
  });
  it('is false for a city route with deals', () => {
    expect(isEmptyCityPage(route, { deals: [{}] })).toBe(false);
  });
  it('reads listing payloads too: a city listing with no items is empty (ST-42)', () => {
    expect(isEmptyCityPage({ path: '/deals/pune', listing: 'deals', city: 'Pune' }, { items: [] })).toBe(true);
    expect(isEmptyCityPage({ path: '/deals/pune', listing: 'deals', city: 'Pune' }, { items: [{}] })).toBe(false);
  });
  it('is false for a plain category route, even with no deals', () => {
    expect(isEmptyCityPage({ path: '/category/massage', slug: 'massage' }, { deals: [] })).toBe(false);
  });
});

describe('STATIC_PUBLIC_PATHS', () => {
  it('lists the public pages for the sitemap', () => {
    expect(STATIC_PUBLIC_PATHS).toEqual([
      '/', '/categories', '/deals', '/products', '/therapists', '/blog', '/about', '/how-it-works',
      '/contact', '/careers', '/become-vendor', '/privacy', '/terms', '/accessibility', '/cookies',
    ]);
  });
});
