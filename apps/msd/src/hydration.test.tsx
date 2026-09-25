import { StrictMode } from 'react';
import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './app/app';
import { render } from './entry-server';
import { PrerenderDataProvider, categoryDataKey, type PrerenderPayload } from './prerender-data/prerender-data';

const fx = vi.hoisted(() => {
  const vendor = { id: 'v1', slug: 'calm-spa', businessName: 'Calm Spa', city: 'Gorakhpur', logoUrl: null };
  const branch = { id: 'b1', name: 'Main', city: 'Gorakhpur' };
  const massage = { id: 'c1', name: 'Massage', slug: 'massage', description: 'Relaxing massages', type: 'SERVICE', sortOrder: 1, children: [{ id: 's1', name: 'Swedish', slug: 'swedish', description: null }] };
  const deal = {
    id: 'd1',
    title: 'Swedish Massage 60',
    originalPrice: '2000',
    salePrice: '1500',
    discountPercent: 25,
    durationMinutes: 60,
    images: ['https://images.example/d1.jpg?w=600'],
    vendor,
    packages: [{ id: 'p1', durationMinutes: 60, sellingPrice: '1500', originalPrice: '2000' }],
    popularTags: [{ id: 't1', name: 'Trending', slug: 'trending' }],
    category: { id: 'c1', name: 'Massage', slug: 'massage' },
    branch,
  };
  const therapist = {
    id: 'th1',
    therapistType: 'Legs Therapist',
    personName: 'Ramesh Kumar',
    photoUrl: 'https://images.example/th1.jpg',
    packages: [{ id: 'tp1', durationMinutes: 30, sellingPrice: '700', originalPrice: null }],
    vendor,
    branch,
  };
  const product = { id: 'pr1', name: 'Massage Oil', image: 'https://images.example/o.jpg', imageAlt: 'Oil', price: '499', originalPrice: '599', discount: 17, vendor };
  const faq = { id: 'f1', question: 'Can I cancel?', answer: 'Yes, 24 hours before.' };
  const shell = {
    categories: [massage],
    locations: [{ state: 'Uttar Pradesh', city: 'Gorakhpur' }],
    socialLinks: [],
  };
  return { shell, massage, deal, therapist, product, faq };
});

vi.mock('./api/catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/catalog')>();
  const ok = (data: unknown) => () => Promise.resolve({ data });
  const fixtures: Record<string, () => Promise<{ data: unknown }>> = {
    listCatalogCategories: ok(fx.shell.categories),
    listCatalogLocations: ok(fx.shell.locations),
    listCatalogSocialLinks: ok([]),
    getCatalogCategory: ok(fx.massage),
    listCatalogDeals: ok([fx.deal]),
    listCatalogProducts: ok([fx.product]),
    listCatalogTherapists: ok([fx.therapist]),
    listCatalogFaqs: ok([fx.faq]),
  };
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) =>
      typeof value === 'function' && /^(list|get)Catalog/.test(name) ? [name, vi.fn(fixtures[name] ?? ok([]))] : [name, value],
    ),
  );
});

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/**
 * Hydration problems in a console message, minus one benign case. Custom elements (shared-ui's
 * Lit components, md-icon, Swiper) are registered before `hydrateRoot`, exactly as in main.tsx,
 * so on upgrade they add attributes to their own host (`variant`, `shape`, `aria-hidden`, Swiper
 * slide classes). React's dev build then logs "attributes ... didn't match" listing those
 * DOM-only attributes as `-` lines; production React never diffs attributes. That message counts
 * only when a `+` line (a value the client wants) conflicts with the server DOM; a className the
 * DOM extends (Swiper appending classes) is fine. Text or structure mismatches surface as
 * recoverable errors instead, which the tests assert separately.
 */
function hydrationProblems(messages: string[]): string[] {
  return messages.filter((m) => {
    if (!/hydrat/i.test(m)) return false;
    if (!m.includes("attributes of the server rendered HTML didn't match")) return true;
    const ATTR = /^\s*([+-])\s+([\w:-]+)=(\{.*\}|".*")\s*$/gm;
    const attrs = (sign: '+' | '-') => [...m.matchAll(ATTR)].filter((x) => x[1] === sign).map((x) => [x[2], x[3]] as const);
    const server = attrs('-');
    return attrs('+').some(([name, value]) => {
      if (name !== 'className') return true;
      const want = value.replace(/"/g, '').split(/\s+/);
      return !server.some(([n, v]) => n === name && want.every((c) => v.replace(/"/g, '').split(/\s+/).includes(c)));
    });
  });
}

/** Server-renders `url` exactly as the prerender does, then hydrates it with the same tree as
 *  main.tsx and the same payload, collecting every hydration error. */
async function roundTrip(url: string, payload: PrerenderPayload) {
  const html = render(url, payload);
  window.history.pushState({}, '', url);
  document.body.innerHTML = `<div id="root" data-prerendered>${html}</div>`;
  const container = document.getElementById('root') as HTMLElement;
  const recoverable: unknown[] = [];
  const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => {
    root = hydrateRoot(
      container,
      <StrictMode>
        <PrerenderDataProvider payload={payload}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </PrerenderDataProvider>
      </StrictMode>,
      { onRecoverableError: (e) => recoverable.push(e) },
    );
  });
  const hydrationErrors = hydrationProblems(consoleErrors.mock.calls.map((c) => c.map(String).join(' ')));
  return { html, recoverable, hydrationErrors, container };
}

describe('prerender hydration round-trip', () => {
  it('hydrates the home page without a mismatch', async () => {
    const { html, recoverable, hydrationErrors, container } = await roundTrip('/', {
      shell: fx.shell,
      home: { deals: [fx.deal], products: [fx.product], therapists: [fx.therapist], faqs: [fx.faq] },
    });
    expect(html).toContain('Swedish Massage 60');
    expect(recoverable).toEqual([]);
    expect(hydrationErrors).toEqual([]);
    expect(container.textContent).toContain('Swedish Massage 60');
  });

  it('hydrates a city page without a mismatch', async () => {
    const { html, recoverable, hydrationErrors, container } = await roundTrip('/category/massage/gorakhpur', {
      shell: fx.shell,
      [categoryDataKey('massage', 'Gorakhpur')]: { category: fx.massage, deals: [fx.deal], total: 1 },
    });
    expect(html).toContain('Massage in Gorakhpur');
    expect(recoverable).toEqual([]);
    expect(hydrationErrors).toEqual([]);
    expect(container.textContent).toContain('Swedish Massage 60');
  });
});
