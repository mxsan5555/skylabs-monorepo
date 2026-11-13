import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesMatching } from '../test-utils/source-files';

/**
 * P2-16: tokens travel as `Authorization: Bearer` only. The API sets no cookie, so a browser
 * never sends credentials on its own and CSRF does not apply. Adding a cookie needs `HttpOnly`,
 * `Secure`, `SameSite` and CSRF protection first (ARCHITECTURE §12.2), so this test fails on any
 * cookie code until that decision is revisited.
 */
const API_ROOT = join(__dirname, '../..');
const COOKIE_CODE = /\bres\.cookie\(|\.clearCookie\(|['"]Set-Cookie['"]|cookie-parser|express-session/i;

describe('token transport (P2-16)', () => {
  it('sets no cookie anywhere in the API', () => {
    expect(filesMatching(API_ROOT, ['src'], COOKIE_CODE)).toEqual([]);
  });
});
