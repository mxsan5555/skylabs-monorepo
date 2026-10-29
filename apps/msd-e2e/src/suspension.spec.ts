import { test, expect, type APIRequestContext } from '@playwright/test';
import jwt from 'jsonwebtoken';

/**
 * Real-browser verification of Member Suspension against the actual running msd-api + Postgres
 * (NOT mocked routes) — the previous report verified this only via mocked-Prisma unit tests,
 * which this spec is deliberately not relying on (see its own task's "reproduce the exact
 * action, do not rely on previous tests" instruction).
 *
 * Signs a real admin access token in-process (same `jwt.sign(payload, JWT_SECRET, {expiresIn})`
 * msd-api's own `signAccessToken` does) — requires `JWT_SECRET` and an admin user id/vendor id
 * to be provided via env when running this spec locally (see the constants below); skips itself
 * entirely when they are not set, rather than failing noisily in an environment that can't run
 * a live-data test.
 */

const API_BASE = process.env.MSD_API_BASE ?? 'http://localhost:3333/api/v1';
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USER_ID = process.env.E2E_ADMIN_USER_ID;
const VENDOR_ID = process.env.E2E_SUSPEND_VENDOR_ID;
const VENDOR_SLUG = process.env.E2E_SUSPEND_VENDOR_SLUG;
const DEAL_SLUG = process.env.E2E_SUSPEND_DEAL_SLUG;
const PRODUCT_SLUG = process.env.E2E_SUSPEND_PRODUCT_SLUG;
const THERAPIST_SLUG = process.env.E2E_SUSPEND_THERAPIST_SLUG;

const canRun = Boolean(JWT_SECRET && ADMIN_USER_ID && VENDOR_ID && VENDOR_SLUG && DEAL_SLUG && PRODUCT_SLUG && THERAPIST_SLUG);

function adminToken(): string {
  return jwt.sign({ sub: ADMIN_USER_ID, roles: ['super_admin'], app: 'msd' }, JWT_SECRET as string, { expiresIn: '15m' });
}

async function setStatus(request: APIRequestContext, status: 'SUSPENDED' | 'ACTIVE') {
  const res = await request.patch(`${API_BASE}/vendors/${VENDOR_ID}/status`, {
    headers: { Authorization: `Bearer ${adminToken()}` },
    data: { status, ...(status === 'SUSPENDED' ? { reason: 'e2e suspension verification' } : {}) },
  });
  expect(res.status()).toBe(200);
}

test.describe('Member Suspension — real browser against the real running backend', () => {
  test.skip(!canRun, 'Requires JWT_SECRET, E2E_ADMIN_USER_ID and E2E_SUSPEND_* env vars pointing at a real seeded vendor — see this file\'s own doc comment.');

  test('suspending hides the vendor\'s deal/product/therapist on the actual rendered page, reactivating restores them', async ({ page, request }) => {
    test.slow();
    try {
      // ── Before suspension: the real pages render real content ──────────────────────────
      await page.goto(`/deal/${DEAL_SLUG}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Deal not found')).toHaveCount(0);

      await page.goto(`/products/${PRODUCT_SLUG}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.goto(`/therapist/${THERAPIST_SLUG}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // ── Suspend via the real admin API (same endpoint the admin "Suspend" action calls) ──
      await setStatus(request, 'SUSPENDED');

      // ── A FRESH navigation (not a stale already-open tab) must show genuine not-found ────
      await page.goto(`/deal/${DEAL_SLUG}`);
      await expect(page.getByText(/not found/i)).toBeVisible();

      await page.goto(`/products/${PRODUCT_SLUG}`);
      await expect(page.getByText(/not found/i)).toBeVisible();

      await page.goto(`/therapist/${THERAPIST_SLUG}`);
      await expect(page.getByText(/not found/i)).toBeVisible();

      await page.goto(`/vendor/${VENDOR_SLUG}`);
      await expect(page.getByText(/not found/i)).toBeVisible();

      // ── Reactivate — a fresh navigation shows real content again ────────────────────────
      await setStatus(request, 'ACTIVE');
      await page.goto(`/deal/${DEAL_SLUG}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText(/not found/i)).toHaveCount(0);
    } finally {
      // Always leave the real seeded vendor ACTIVE, even if an assertion above failed.
      await setStatus(request, 'ACTIVE').catch(() => {});
    }
  });
});
