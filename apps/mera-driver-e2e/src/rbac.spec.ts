import { test, expect, request as playwrightRequest } from '@playwright/test';

/**
 * RBAC end-to-end coverage: sign-in -> OTP -> dashboard, and permission-gated
 * route access for the Role Management screen.
 *
 * ── Why these are guarded by a live-backend probe ──────────────────────────
 * There is no reachable Postgres/mera-driver-api in this sandbox (verified: a
 * TCP probe to localhost:5432 times out, and mera-driver-api isn't running), so
 * `beforeAll` below pings `${API_URL}/health` and every test in this file is
 * skipped with an explicit reason if it isn't reachable — rather than hanging on
 * an OTP that can never arrive, or failing in a way that looks like a real
 * regression. Delete the skip-guard once this suite runs somewhere with the
 * environment described below.
 *
 * ── What a runnable environment needs ──────────────────────────────────────
 * 1. mera-driver-api running at API_URL (default http://localhost:3334, matching
 *    `apps/mera-driver/src/environments/environment.ts`), backed by a migrated +
 *    seeded Postgres — `npx prisma migrate deploy && npx prisma db seed` (or
 *    equivalent) against the schema in `apps/mera-driver-api/prisma/`.
 * 2. Seed data must include, at minimum:
 *      - A Role with `isSuperAdmin: true`, active, granted at least
 *        `rbac.roles:view`, `rbac.users:view`, `rbac.audit-logs:view`, and
 *        `dashboard:view` (RolePermission rows), plus a DashboardWidget assigned
 *        to it so the dashboard has something role-appropriate to render.
 *      - A plain low-privilege role (e.g. `driver`/`customer`, matching
 *        `DEFAULT_ROLE_KEY` in `auth.service.ts`) with `dashboard:view` only —
 *        no `rbac.*` grants — to exercise the redirect-on-insufficient-permission
 *        case below.
 *      - A User per persona, reachable by the identifiers configured via
 *        `E2E_SUPERADMIN_IDENTIFIER` / `E2E_DRIVER_IDENTIFIER` env vars (or the
 *        defaults below).
 * 3. A way for this test to read the OTP without a real SMS/email provider.
 *    `otp.service.ts` currently only `console.log`s
 *    `[otp:dev] <purpose> OTP for <identifier>: <code>` on the API process's
 *    stdout when `NODE_ENV !== 'production'` — there is no HTTP-visible way to
 *    read it today. The cleanest fix is a test-only endpoint (or a fixed/echoed
 *    OTP behind an `E2E_FIXED_OTP` env flag, read by `otp.service.ts` only when
 *    that flag is set) so Playwright never has to scrape server logs. Until
 *    that lands, `OTP_CODE` below is a placeholder and the OTP-dependent tests
 *    will not get past the `/otp` screen even with a reachable API.
 */

const API_URL = process.env['MERA_DRIVER_API_URL'] ?? 'http://localhost:3334';
const SUPERADMIN_IDENTIFIER = process.env['E2E_SUPERADMIN_IDENTIFIER'] ?? 'superadmin@example.com';
const DRIVER_IDENTIFIER = process.env['E2E_DRIVER_IDENTIFIER'] ?? 'driver@example.com';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '000000'; // placeholder — see file header, item 3

let apiReachable = false;

test.beforeAll(async () => {
  try {
    const ctx = await playwrightRequest.newContext();
    const res = await ctx.get(`${API_URL}/health`, { timeout: 2000 });
    apiReachable = res.ok();
    await ctx.dispose();
  } catch {
    apiReachable = false;
  }
});

/** Drives sign-in -> OTP through the UI. Requires OTP_CODE to be the real code — see file header. */
async function signInAndVerify(page: import('@playwright/test').Page, identifier: string) {
  await page.goto('/sign-in');
  // sign-in.ts defaults `method` to 'phone'; switch to the Email tab so an
  // email identifier is accepted (md-tabs (change) -> onTabChange, index 0 = email).
  await page.getByRole('tab', { name: /email/i }).click();
  await page.getByLabel(/email/i).fill(identifier);
  await page.getByRole('button', { name: /send otp/i }).click();

  await expect(page).toHaveURL(/\/otp/);
  await page.getByLabel(/6-digit code/i).fill(OTP_CODE);
  await page.getByRole('button', { name: /verify & continue/i }).click();
}

test.describe('Sign-in -> OTP -> dashboard', () => {
  test.beforeEach(() => {
    test.skip(
      !apiReachable,
      `mera-driver-api not reachable at ${API_URL} (no Postgres/API in this environment) — see file header for the setup this suite needs.`,
    );
  });

  test('a SuperAdmin signs in and lands on a dashboard with role-appropriate widgets', async ({ page }) => {
    await signInAndVerify(page, SUPERADMIN_IDENTIFIER);

    await expect(page).toHaveURL(/\/account\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Dashboard.ts only renders a widget card for entries present in
    // `WIDGET_REGISTRY` that the bootstrap response actually granted — presence
    // of at least one confirms server-driven, role-appropriate widget rendering
    // (as opposed to a hardcoded/static dashboard).
    await expect(page.locator('[class*="widget"]').first()).toBeVisible();
  });

  test('a low-privilege driver role is redirected away from Role Management', async ({ page }) => {
    await signInAndVerify(page, DRIVER_IDENTIFIER);
    await expect(page).toHaveURL(/\/account\/dashboard/);

    await page.goto('/account/administration/roles');

    // permissionGuard redirects to /account/profile when `rbac.roles:view` is missing.
    await expect(page).toHaveURL(/\/account\/profile/);
  });

  test('a SuperAdmin can load Role Management', async ({ page }) => {
    await signInAndVerify(page, SUPERADMIN_IDENTIFIER);

    await page.goto('/account/administration/roles');

    await expect(page).toHaveURL(/\/account\/administration\/roles/);
    await expect(page.getByRole('heading', { name: /role management/i })).toBeVisible();
  });
});

test.describe('Mobile layout', () => {
  test.beforeEach(() => {
    test.skip(!apiReachable, `mera-driver-api not reachable at ${API_URL} — see file header.`);
  });

  test('sign-in does not overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/sign-in');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });
});
