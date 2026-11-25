import { describe, expect, it } from 'vitest';
import { googleSignInUrl } from './auth';

describe('googleSignInUrl', () => {
  it('starts OAuth at the API and carries only the validated in-app return destination', () => {
    const url = new URL(googleSignInUrl('https://api.example.com/api/v1', '/my-dashboard?tab=orders'));
    expect(url.origin).toBe('https://api.example.com');
    expect(url.pathname).toBe('/api/v1/auth/google');
    expect(url.searchParams.get('next')).toBe('/my-dashboard?tab=orders');
  });

  it('does not add a return destination when none was captured', () => {
    const url = new URL(googleSignInUrl('https://api.example.com/api/v1'));
    expect(url.search).toBe('');
  });
});
