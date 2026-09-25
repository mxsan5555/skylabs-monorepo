import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Seo } from './seo';

vi.mock('./site-url', () => ({
  SITE_URL: 'https://www.myspadeal.in',
  absoluteUrl: (path: string) => new URL(path, 'https://www.myspadeal.in/').toString(),
}));

const q = (sel: string) => document.querySelector(sel);

describe('Seo', () => {
  it('emits title, description, canonical and Open Graph tags', () => {
    render(<Seo title="Massage in Pune | MSD" description="Book massage deals in Pune." path="/category/massage/pune" />);
    expect(document.title).toBe('Massage in Pune | MSD');
    expect(q('meta[name="description"]')?.getAttribute('content')).toBe('Book massage deals in Pune.');
    expect(q('link[rel="canonical"]')?.getAttribute('href')).toBe('https://www.myspadeal.in/category/massage/pune');
    expect(q('meta[property="og:title"]')?.getAttribute('content')).toBe('Massage in Pune | MSD');
    expect(q('meta[property="og:url"]')?.getAttribute('content')).toBe('https://www.myspadeal.in/category/massage/pune');
    expect(q('meta[name="robots"]')).toBeNull();
  });

  it('adds noindex and JSON-LD when asked', () => {
    render(<Seo title="t" description="d" path="/x" noindex jsonLd={{ '@type': 'Thing', name: 'x' }} />);
    expect(q('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    expect(JSON.parse(q('script[type="application/ld+json"]')?.textContent ?? '{}').name).toBe('x');
  });
});
