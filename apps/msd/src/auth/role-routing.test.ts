import { describe, it, expect } from 'vitest';
import type { BootstrapResponse } from '@skylabs-monorepo/shared-types';
import {
  extractReturnUrl,
  isCustomerAccountUser,
  isDualRoleUser,
  isVendorUser,
  resolvePostLoginPath,
  sanitizeReturnUrl,
  signInPathWithNext,
  signInPathWithReturnTo,
} from './role-routing';

const withRoles = (...keys: string[]) => ({ roles: keys.map((key) => ({ key })) }) as unknown as BootstrapResponse;

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

describe('sanitizeReturnUrl', () => {
  it('accepts a plain in-app path', () => {
    expect(sanitizeReturnUrl('/explore?q=Swedish%20Massage')).toBe('/explore?q=Swedish%20Massage');
  });

  it('rejects an external absolute URL', () => {
    expect(sanitizeReturnUrl('https://evil.example.com/phish')).toBeNull();
  });

  it('rejects a protocol-relative URL', () => {
    expect(sanitizeReturnUrl('//evil.example.com')).toBeNull();
  });

  it('rejects a path back into /sign-in or /otp', () => {
    expect(sanitizeReturnUrl('/sign-in')).toBeNull();
    expect(sanitizeReturnUrl('/otp')).toBeNull();
  });
});

describe('signInPathWithNext', () => {
  it('builds /sign-in?next=<encoded returnUrl> when a returnUrl is given', () => {
    expect(signInPathWithNext('/explore?q=Swedish Massage')).toBe('/sign-in?next=%2Fexplore%3Fq%3DSwedish%20Massage');
  });

  it('builds plain /sign-in when returnUrl is null/undefined/empty', () => {
    expect(signInPathWithNext(null)).toBe('/sign-in');
    expect(signInPathWithNext(undefined)).toBe('/sign-in');
    expect(signInPathWithNext('')).toBe('/sign-in');
  });
});

describe('signInPathWithReturnTo', () => {
  it('captures pathname + search + hash from a Location-like object', () => {
    expect(signInPathWithReturnTo({ pathname: '/category/spa', search: '?sort=price-asc', hash: '#top' })).toBe(
      `/sign-in?next=${encodeURIComponent('/category/spa?sort=price-asc#top')}`,
    );
  });

  it('handles a bare pathname with no search or hash', () => {
    expect(signInPathWithReturnTo({ pathname: '/products' })).toBe('/sign-in?next=%2Fproducts');
  });

  it('preserves a multi-value query string exactly, per requirement 1\'s /explore example', () => {
    const location = { pathname: '/explore', search: '?q=Swedish%20Massage', hash: '' };
    expect(signInPathWithReturnTo(location)).toBe(`/sign-in?next=${encodeURIComponent('/explore?q=Swedish%20Massage')}`);
  });
});

describe('isCustomerAccountUser', () => {
  it('is true for a customer', () => {
    expect(isCustomerAccountUser(withRoles('customer'))).toBe(true);
  });

  it('is true for a customer who is also a member (dual role)', () => {
    expect(isCustomerAccountUser(withRoles('customer', 'member'))).toBe(true);
  });

  it('is false for staff, even with the customer role', () => {
    expect(isCustomerAccountUser(withRoles('super_admin', 'customer'))).toBe(false);
  });

  it('is false for a member without the customer role', () => {
    expect(isCustomerAccountUser(withRoles('member'))).toBe(false);
  });
});

/**
 * Regression coverage for the msd-api `vendor` -> `member` role-key rename (see
 * `lib/role-keys.ts#MEMBER_ROLE_KEYS` server-side): a real Member account's bootstrap carries
 * whichever key its Role row currently has, so this must recognize both during the transition —
 * never only the pre-rename `'vendor'` key.
 */
describe('isVendorUser', () => {
  it('is true for the canonical `member` key', () => {
    expect(isVendorUser(withRoles('member'))).toBe(true);
  });

  it('is true for the pre-rename `vendor` key (transitional)', () => {
    expect(isVendorUser(withRoles('vendor'))).toBe(true);
  });

  it('is false for a plain customer', () => {
    expect(isVendorUser(withRoles('customer'))).toBe(false);
  });
});

describe('isDualRoleUser / resolvePostLoginPath', () => {
  it('sends a customer+member user to the chooser regardless of which member key is present', () => {
    expect(isDualRoleUser(withRoles('customer', 'member'))).toBe(true);
    expect(resolvePostLoginPath(withRoles('customer', 'member'))).toBe('/choose-experience');
    expect(isDualRoleUser(withRoles('customer', 'vendor'))).toBe(true);
    expect(resolvePostLoginPath(withRoles('customer', 'vendor'))).toBe('/choose-experience');
  });

  it('sends a member-only user straight to the admin console', () => {
    expect(resolvePostLoginPath(withRoles('member'))).toBe('/account/dashboard');
  });

  it('sends staff to the admin console even if also flagged member (should not happen, but staff wins)', () => {
    expect(resolvePostLoginPath(withRoles('admin', 'member'))).toBe('/account/dashboard');
  });
});
