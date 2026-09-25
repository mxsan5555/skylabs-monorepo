import { afterEach, describe, it, expect, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('site-url', () => {
  it('is empty and omits absolute URLs when VITE_SITE_URL is unset', async () => {
    vi.stubEnv('VITE_SITE_URL', '');
    const { SITE_URL, absoluteUrl } = await import('./site-url');
    expect(SITE_URL).toBe('');
    expect(absoluteUrl('/x')).toBeUndefined();
  });

  it('trims a trailing slash and builds absolute URLs when set', async () => {
    vi.stubEnv('VITE_SITE_URL', 'https://x.in/');
    const { SITE_URL, absoluteUrl } = await import('./site-url');
    expect(SITE_URL).toBe('https://x.in');
    expect(absoluteUrl('/a/b')).toBe('https://x.in/a/b');
  });
});
