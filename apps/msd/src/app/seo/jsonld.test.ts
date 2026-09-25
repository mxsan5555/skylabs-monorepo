import { describe, it, expect } from 'vitest';
import { breadcrumbJsonLd, faqPageJsonLd, itemListJsonLd, organizationJsonLd, serializeJsonLd, websiteJsonLd } from './jsonld';

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
    expect(serializeJsonLd({ name: '</script><b>' })).toContain(String.raw`\u003c/script>`);
  });

  it('escapes U+2028 and U+2029', () => {
    const out = serializeJsonLd({ name: 'a\u2028b\u2029c' });
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(out).toContain(String.raw`a\u2028b\u2029c`);
  });
});

describe('home builders', () => {
  it('builds an ItemList of Products, each with a nested INR Offer, with absolute URLs', () => {
    const list = itemListJsonLd('https://x.in', [
      { name: 'Swedish Massage', path: '/deal/d1', price: 1499 },
      { name: 'Hair Spa', path: '/deal/d2', price: 799 },
    ]);
    expect(list['@type']).toBe('ItemList');
    expect(list.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'Product',
          name: 'Swedish Massage',
          url: 'https://x.in/deal/d1',
          offers: { '@type': 'Offer', price: 1499, priceCurrency: 'INR', url: 'https://x.in/deal/d1' },
        },
      },
      {
        '@type': 'ListItem',
        position: 2,
        item: {
          '@type': 'Product',
          name: 'Hair Spa',
          url: 'https://x.in/deal/d2',
          offers: { '@type': 'Offer', price: 799, priceCurrency: 'INR', url: 'https://x.in/deal/d2' },
        },
      },
    ]);
    expect(JSON.stringify(list)).not.toContain('aggregateRating');
  });

  it('includes image on the Product only when provided', () => {
    const list = itemListJsonLd('https://x.in', [
      { name: 'Swedish Massage', path: '/deal/d1', price: 1499, image: 'https://x.in/d1.jpg' },
      { name: 'Hair Spa', path: '/deal/d2', price: 799 },
    ]);
    const items = list.itemListElement as { item: Record<string, unknown> }[];
    expect(items[0].item.image).toBe('https://x.in/d1.jpg');
    expect(items[1].item).not.toHaveProperty('image');
  });

  it('builds a FAQPage', () => {
    expect(faqPageJsonLd([{ question: 'Can I cancel?', answer: 'Yes, 24 hours before.' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Can I cancel?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, 24 hours before.' } }],
    });
  });
});
