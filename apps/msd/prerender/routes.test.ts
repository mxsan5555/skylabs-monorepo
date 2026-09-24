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
  it('returns home, every category and every deal-category x unique city', () => {
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
    ]);
  });

  it('keeps the first location for a duplicate city slug and carries its name and state', () => {
    const route = buildRoutes(shell).find((r) => r.path === '/category/massage/pune');
    expect(route).toEqual({ path: '/category/massage/pune', slug: 'massage', city: 'Pune', state: 'Maharashtra' });
  });

  it('returns only home for an empty shell', () => {
    expect(buildRoutes({ categories: [], locations: [], socialLinks: [] })).toEqual([{ path: '/' }]);
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
  it('is false for a plain category route, even with no deals', () => {
    expect(isEmptyCityPage({ path: '/category/massage', slug: 'massage' }, { deals: [] })).toBe(false);
  });
});

describe('STATIC_PUBLIC_PATHS', () => {
  it('lists the public pages for the sitemap', () => {
    expect(STATIC_PUBLIC_PATHS).toEqual([
      '/', '/explore', '/categories', '/products', '/therapists', '/blog', '/about', '/how-it-works',
      '/contact', '/careers', '/become-vendor', '/privacy', '/terms', '/accessibility', '/cookies',
    ]);
  });
});
