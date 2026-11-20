import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesMatching } from '../test-utils/source-files';

/**
 * P2-16 (revised 2026-11-16): the access token still travels as `Authorization: Bearer`; the
 * refresh token moved to an `HttpOnly`, `Secure` (production), `SameSite` cookie with a
 * double-submit CSRF cookie (ARCHITECTURE §12.2). `app.ts` (mounts `cookie-parser`) and
 * `lib/auth-cookies.ts` (the only module allowed to call `res.cookie`/`res.clearCookie`) are the
 * sole sanctioned sources of cookie code; this test fails on any cookie code anywhere else, so a
 * route can't start setting its own ad hoc cookie.
 */
const API_ROOT = join(__dirname, '../..');
const COOKIE_CODE = /\bres\.cookie\(|\.clearCookie\(|['"]Set-Cookie['"]|cookie-parser|express-session/i;
const SANCTIONED_COOKIE_FILES = new Set(['src\\app.ts', 'src\\lib\\auth-cookies.ts', 'src/app.ts', 'src/lib/auth-cookies.ts']);

describe('token transport (P2-16)', () => {
  it('sets cookies only from the sanctioned auth-cookies module', () => {
    const matches = filesMatching(API_ROOT, ['src'], COOKIE_CODE);
    expect(matches.filter((file) => !SANCTIONED_COOKIE_FILES.has(file))).toEqual([]);
  });
});
