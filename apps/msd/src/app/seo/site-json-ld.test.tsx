import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SiteJsonLd } from './site-json-ld';

vi.mock('./site-url', () => ({ SITE_URL: 'https://www.myspadeal.in', absoluteUrl: (p: string) => `https://www.myspadeal.in${p}` }));
vi.mock('../../catalog/catalog-shell', () => ({
  useCatalogShell: () => ({ socialLinks: [{ id: 's1', platform: 'x', displayName: 'X', url: 'https://x.com/msd' }] }),
}));

describe('SiteJsonLd', () => {
  it('emits Organization (with sameAs) and WebSite', () => {
    render(<SiteJsonLd />);
    const data = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '[]');
    expect(data.map((d: { '@type': string }) => d['@type'])).toEqual(['Organization', 'WebSite']);
    expect(data[0].sameAs).toEqual(['https://x.com/msd']);
  });
});
