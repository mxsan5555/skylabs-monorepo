import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8'));

describe('vercel.json', () => {
  it('serves one canonical URL per page: no trailing slash, no .html', () => {
    expect(config.trailingSlash).toBe(false);
    expect(config.cleanUrls).toBe(true);
  });

  it('falls back to the SPA shell by its clean path for every non-API route', () => {
    expect(config.rewrites).toEqual([{ source: '/((?!api/).*)', destination: '/spa' }]);
  });
});
