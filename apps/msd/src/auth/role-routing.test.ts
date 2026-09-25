import { describe, it, expect } from 'vitest';
import { extractReturnUrl } from './role-routing';

describe('extractReturnUrl', () => {
  it('reads a plain ?next= path', () => {
    expect(extractReturnUrl({ search: '?next=%2Fvendor%2Furban-wellness-spa' })).toBe(
      '/vendor/urban-wellness-spa',
    );
  });

  it('reads a ?next= path with its own query string, fully preserved', () => {
    const next = encodeURIComponent('/explore?q=spa&category=massage');
    expect(extractReturnUrl({ search: `?next=${next}` })).toBe('/explore?q=spa&category=massage');
  });

  it('falls back to RequireAuth\'s location.state.from when no ?next= is present', () => {
    expect(
      extractReturnUrl({
        search: '',
        state: { from: { pathname: '/cart', search: '', hash: '' } },
      }),
    ).toBe('/cart');
  });

  it('preserves state.from search/hash', () => {
    expect(
      extractReturnUrl({
        search: '',
        state: { from: { pathname: '/category/spa', search: '?sort=price-asc', hash: '#top' } },
      }),
    ).toBe('/category/spa?sort=price-asc#top');
  });

  it('prefers ?next= over state.from when both are somehow present', () => {
    expect(
      extractReturnUrl({
        search: '?next=%2Fvendor%2Fabc',
        state: { from: { pathname: '/cart' } },
      }),
    ).toBe('/vendor/abc');
  });

  it('returns null when neither source is present', () => {
    expect(extractReturnUrl({ search: '' })).toBeNull();
    expect(extractReturnUrl({})).toBeNull();
  });

  it('rejects a protocol-relative URL (open-redirect guard)', () => {
    expect(extractReturnUrl({ search: `?next=${encodeURIComponent('//evil.example.com')}` })).toBeNull();
  });

  it('rejects an absolute URL', () => {
    expect(extractReturnUrl({ search: `?next=${encodeURIComponent('https://evil.example.com/phish')}` })).toBeNull();
  });

  it('rejects a return path pointing back into /sign-in (redirect-loop guard)', () => {
    expect(extractReturnUrl({ search: `?next=${encodeURIComponent('/sign-in')}` })).toBeNull();
    expect(extractReturnUrl({ search: `?next=${encodeURIComponent('/sign-in?next=%2Fcart')}` })).toBeNull();
  });

  it('rejects a return path pointing back into /otp (redirect-loop guard)', () => {
    expect(extractReturnUrl({ search: `?next=${encodeURIComponent('/otp')}` })).toBeNull();
  });

  it('rejects an empty ?next= value', () => {
    expect(extractReturnUrl({ search: '?next=' })).toBeNull();
  });
});
