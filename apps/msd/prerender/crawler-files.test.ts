import { describe, expect, it } from 'vitest';
import { llmsTxt, robotsTxt, sitemapXml } from './crawler-files';
import type { ShellData } from '../src/prerender-data/loaders';

const site = 'https://www.myspadeal.in';

describe('robotsTxt', () => {
  const txt = robotsTxt(site);
  it('allows all and disallows private routes', () => {
    expect(txt).toMatch(/^User-agent: \*\nAllow: \//);
    for (const p of ['/account', '/my-account', '/cart', '/checkout', '/orders', '/sign-in', '/otp', '/wishlist', '/choose-experience'])
      expect(txt).toContain(`Disallow: ${p}\n`);
  });
  it('ends with the sitemap line', () => {
    expect(txt.trimEnd().endsWith(`Sitemap: ${site}/sitemap.xml`)).toBe(true);
  });
});

describe('sitemapXml', () => {
  const xml = sitemapXml(site, ['/', '/category/spa&wellness'], '2026-09-24');
  it('is a urlset with one escaped url per path and a lastmod', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).toContain(`<loc>${site}/</loc>`);
    expect(xml).toContain(`<loc>${site}/category/spa&amp;wellness</loc>`);
    expect(xml.match(/<lastmod>2026-09-24<\/lastmod>/g)).toHaveLength(2);
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });
});

describe('llmsTxt', () => {
  const shell = {
    categories: [{ id: '1', name: 'Massage', slug: 'massage', description: null, children: [] }],
    locations: [],
    socialLinks: [],
  } as unknown as ShellData;
  const txt = llmsTxt(site, shell);
  it('starts with the site name and a summary', () => {
    expect(txt.startsWith('# MySpaDeal\n\n> ')).toBe(true);
    expect(txt).toContain('Discover trusted spa, beauty, and wellness experiences');
  });
  it('lists categories and pages', () => {
    expect(txt).toContain(`## Categories\n\n- [Massage](${site}/category/massage)`);
    expect(txt).toContain('## Pages');
    for (const p of ['/', '/explore', '/how-it-works', '/about', '/contact', '/become-vendor']) expect(txt).toContain(`(${site}${p})`);
  });
});

describe('llmsTxt without catalog data', () => {
  it('omits the Categories section', () => {
    const txt = llmsTxt(site, { categories: [], locations: [], socialLinks: [] });
    expect(txt).not.toContain('## Categories');
    expect(txt).toContain('## Pages');
  });
});
