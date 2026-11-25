import { describe, expect, it } from 'vitest';
import { sanitizeGoogleReturnTo } from './google-oauth-redirect';

describe('sanitizeGoogleReturnTo', () => {
  it('keeps an in-app path and its query string', () => {
    expect(sanitizeGoogleReturnTo('/my-dashboard?tab=orders')).toBe('/my-dashboard?tab=orders');
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    '/\\evil.example/phish',
    '/%2f%2fevil.example/phish',
    '/sign-in',
    '/auth/google/callback',
  ])('rejects unsafe or auth-loop destination %s', (value) => {
    expect(sanitizeGoogleReturnTo(value)).toBeNull();
  });
});
