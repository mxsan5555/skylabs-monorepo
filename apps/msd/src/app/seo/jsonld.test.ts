import { describe, it, expect } from 'vitest';
import { breadcrumbJsonLd, organizationJsonLd, serializeJsonLd, websiteJsonLd } from './jsonld';

describe('jsonld builders', () => {
  it('builds Organization with optional logo and sameAs', () => {
    expect(organizationJsonLd({ name: 'MySpaDeal', url: 'https://x.in', logo: 'https://x.in/logo.png', sameAs: ['https://ig.com/x'] })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'MySpaDeal',
      url: 'https://x.in',
      logo: 'https://x.in/logo.png',
      sameAs: ['https://ig.com/x'],
    });
    const bare = organizationJsonLd({ name: 'MySpaDeal', url: 'https://x.in', sameAs: [] });
    expect(bare).not.toHaveProperty('sameAs');
    expect(bare).not.toHaveProperty('logo');
  });

  it('builds WebSite with a SearchAction to /explore?q=', () => {
    const site = websiteJsonLd({ name: 'MySpaDeal', url: 'https://x.in' });
    expect(site.potentialAction).toEqual({
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: 'https://x.in/explore?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    });
  });

  it('builds a BreadcrumbList with positions and absolute URLs', () => {
    const list = breadcrumbJsonLd('https://x.in', [
      { name: 'Home', path: '/' },
      { name: 'Massage', path: '/category/massage' },
    ]);
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x.in/' },
      { '@type': 'ListItem', position: 2, name: 'Massage', item: 'https://x.in/category/massage' },
    ]);
  });

  it('serializes safely for an inline script', () => {
    expect(serializeJsonLd({ name: '</script><b>' })).not.toContain('</script>');
  });
});
