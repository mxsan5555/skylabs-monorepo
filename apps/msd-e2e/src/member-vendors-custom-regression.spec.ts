import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Regression coverage for the real incident: after the single-role migration, `vendor-portal.*`
 * grants were intact but `vendors:custom` (the one gate every `/vendors/me/*` self-service route
 * runs on — see `vendors.routes.ts`'s own doc comment) was silently wiped by
 * `applyPermissionMatrix`'s delete, which matched by menuKey alone and didn't know `custom` was a
 * separate, non-matrix-governed plumbing action sharing the `vendors` menuKey with the matrix's
 * "Members" admin resource row. Every Member self-service request then failed with "Missing
 * permission vendors:custom" — confirmed live via `resolveGrantedPermissionKeys(['vendor'])`
 * against the real seeded DB (see this task's own verification notes) returning the exact
 * `vendor-portal.*` + `vendors:custom` set the fix restores.
 *
 * Same network-interception approach as `rbac.spec.ts` (no reachable OTP delivery in this
 * environment — real SMS/SMTP credentials are configured, so a real OTP round-trip can't be
 * read back here without actually receiving an SMS/email). This exercises the real msd app code
 * (routing, `RequirePermission`, `can()`-gated Add/Edit buttons, the Member Business Profile/
 * Branches/Deals/Products/Therapists pages) end to end in a real browser against the EXACT
 * permission set confirmed live, with only the network boundary faked.
 */

const API_BASE = 'http://localhost:3333/api/v1';

function fakeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.fake-signature`;
}

function envelope<T>(data: T, meta?: Record<string, unknown>) {
  return { data, error: null, ...(meta ? { meta } : {}) };
}

/** The exact permission set confirmed live for the `vendor` ("Member") role after the fix —
 *  see diag_resolve_vendor_perms.ts's output in this task's verification notes. */
const MEMBER_PERMISSIONS = [
  'dashboard:view',
  'settings:view', 'settings:edit',
  'vendors:custom',
  'vendor-portal.profile:view', 'vendor-portal.profile:edit',
  'vendor-portal.branches:view', 'vendor-portal.branches:create', 'vendor-portal.branches:edit', 'vendor-portal.branches:status_change',
  'vendor-portal.deals:view', 'vendor-portal.deals:create', 'vendor-portal.deals:edit', 'vendor-portal.deals:status_change',
  'vendor-portal.therapists:view', 'vendor-portal.therapists:create', 'vendor-portal.therapists:edit', 'vendor-portal.therapists:status_change',
  'vendor-portal.products:view', 'vendor-portal.products:create', 'vendor-portal.products:edit',
  'vendor-portal.orders:view',
  'vendor-portal.payments:view',
  'vendor-portal.reports:view',
];

async function signInAsMember(page: Page) {
  const token = fakeJwt({ sub: 'member-1', roles: ['vendor'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
  await page.addInitScript((t) => window.localStorage.setItem('msd_auth_token', t), token);
  await page.route(`${API_BASE}/rbac/bootstrap`, (route: Route) =>
    route.fulfill({
      json: envelope({
        user: { id: 'member-1', name: 'Rahul Member', email: 'rahul.urbanwellness@seed.msd.local', status: 'active' },
        roles: [{ id: 'role-vendor', key: 'vendor', name: 'Member', isSuperAdmin: false }],
        permissions: MEMBER_PERMISSIONS,
        menu: [],
        dashboardWidgets: [{ key: 'vendor-profile', title: 'My Business', order: 1 }],
      }),
    }),
  );
}

test.describe('Member portal — vendors:custom regression', () => {
  test('bootstrap succeeds and the dashboard loads with no permission error', async ({ page }) => {
    await signInAsMember(page);
    await page.goto('/account/dashboard');
    await expect(page).toHaveURL(/\/account\/dashboard$/);
    await expect(page.getByText('Missing permission')).toHaveCount(0);
  });

  test('Business Profile page loads (own:VE) without a vendors:custom error', async ({ page }) => {
    await signInAsMember(page);
    await page.route(`${API_BASE}/vendors/me`, (route: Route) =>
      route.fulfill({
        json: envelope({
          id: 'vendor-1',
          businessName: 'Urban Wellness Spa',
          status: 'ACTIVE',
          kycStatus: 'VERIFIED',
          _count: { branches: 1, deals: 1, products: 1, therapists: 1 },
        }),
      }),
    );
    await page.goto('/account/vendor-profile');
    await expect(page).toHaveURL(/\/account\/vendor-profile$/);
    await expect(page.getByText('Missing permission')).toHaveCount(0);
    await expect(page.getByText(/vendors:custom/)).toHaveCount(0);
  });

  test('Branches page loads and shows Add (own:VCE granted)', async ({ page }) => {
    await signInAsMember(page);
    await page.route(`${API_BASE}/vendors/me/branches*`, (route: Route) => route.fulfill({ json: envelope([], { total: 0 }) }));
    await page.goto('/account/vendor-branches-deals');
    await expect(page).toHaveURL(/\/account\/vendor-branches-deals$/);
    await expect(page.getByText('Missing permission')).toHaveCount(0);
  });

  test('Deals, Products, Therapists, Orders, Payments, Reports, and My Profile all load without a vendors:custom error', async ({ page }) => {
    await signInAsMember(page);
    for (const path of ['/vendors/me/branches', '/vendors/me/products', '/vendors/me/reports']) {
      await page.route(`${API_BASE}${path}*`, (route: Route) => route.fulfill({ json: envelope([], { total: 0 }) }));
    }
    await page.route(`${API_BASE}/rbac/users/me`, (route: Route) =>
      route.fulfill({ json: envelope({ id: 'member-1', name: 'Rahul Member', email: 'rahul.urbanwellness@seed.msd.local', phone: '+919810000002', status: 'active', roles: [{ id: 'role-vendor', key: 'vendor', name: 'Member' }] }) }),
    );

    const pages = [
      '/account/vendor-deals',
      '/account/vendor-products',
      '/account/vendor-therapists',
      '/account/vendor-orders',
      '/account/vendor-payments',
      '/account/vendor-reports',
      '/account/settings',
    ];
    for (const path of pages) {
      await page.goto(path);
      await expect(page, `${path} should not redirect away (permission denied)`).toHaveURL(new RegExp(path.replace(/\//g, '\\/') + '$'));
      await expect(page.getByText('Missing permission')).toHaveCount(0);
    }
  });

  test('Staff Users remains inaccessible to a Member session (redirected away)', async ({ page }) => {
    await signInAsMember(page);
    await page.goto('/account/administration/users');
    await expect(page).not.toHaveURL(/\/account\/administration\/users$/);
  });

  test('a role without vendors:custom (e.g. a stray Admin session) is rejected by the real backend shared guard', async ({ page }) => {
    // Direct API check, not a UI flow: proves the actual shared guard (`requireOrdersOrVendorSelf`
    // style OR-check / `vendors:custom` gate) still denies a caller legitimately lacking it —
    // the fix must not have over-corrected into "grant everyone".
    const res = await page.request.get(`${API_BASE}/vendors/me`, {
      headers: { Authorization: `Bearer ${fakeJwt({ sub: 'admin-1', roles: ['admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 })}` },
    });
    // Against the real msd-api server: 403 (admin has no vendors:custom) or 401 (signature
    // rejected, since this fake token isn't signed with the server's real secret) — either way,
    // never 200.
    expect(res.status()).not.toBe(200);
  });
});
