import { describe, it, expect } from 'vitest';
import content from '../../content.json';

/**
 * ST-08: every public route has a meta description, including the noindex ones (cart, sign in,
 * OTP, orders, invoice, choose experience), so a shared or previewed link never shows a blank
 * snippet. The copy lives in `content.meta`; each page renders it through `Seo`.
 */
const PAGES = ['cart', 'signIn', 'otp', 'orders', 'invoice', 'chooseExperience'] as const;
const DESCRIPTION_MAX = 160;

describe('meta descriptions for noindex public pages (ST-08)', () => {
  it.each(PAGES)('%s has a description of 50 to 160 characters', (page) => {
    const description = (content.meta as Record<string, { description?: string }>)[page]?.description ?? '';
    expect(description.length, page).toBeGreaterThanOrEqual(50);
    expect(description.length, page).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it.each(PAGES)('%s keeps its route path next to the copy', (page) => {
    const meta = (content.meta as Record<string, { path?: string; pathTemplate?: string }>)[page];
    expect(meta?.path ?? meta?.pathTemplate ?? '', page).toMatch(/^\/[a-z-]/);
  });
});
