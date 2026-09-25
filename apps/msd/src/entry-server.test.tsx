// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { render } from './entry-server';

vi.mock('./api/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/catalog')>();
  const empty = () => Promise.resolve({ data: [] });
  const stubbed = Object.fromEntries(
    Object.entries(actual).map(([name, value]) =>
      typeof value === 'function' && /^(list|get)Catalog/.test(name) ? [name, vi.fn(empty)] : [name, value],
    ),
  );
  return stubbed;
});

describe('entry-server render', () => {
  it('renders the home route to HTML under Node', () => {
    expect(typeof window).toBe('undefined');
    const html = render('/', {
      shell: { categories: [], locations: [], socialLinks: [] },
      home: { deals: [], products: [], therapists: [], faqs: [] },
    });
    expect(html).toContain('<h1');
    expect(html).toContain('Spa, massage and beauty deals near you');
  });
});
