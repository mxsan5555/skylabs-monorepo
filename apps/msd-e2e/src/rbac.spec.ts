import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * RBAC e2e coverage for msd (sign-in → OTP → dashboard, and role-gated routing).
 *
 * There is no reachable Postgres/msd-api in this environment (see apps/msd-api's
 * .env.local — DATABASE_URL points at a local instance that isn't running here), so
 * these specs run against the *real* msd dev server (booted by the msd-e2e webServer
 * config) but intercept every `VITE_API_URL` (`http://localhost:3333/api/v1`) call via
 * `page.route`, feeding it fixture responses shaped exactly like msd-api's
 * `ApiEnvelope<T>` (see apps/msd-api/src/schemas + apps/msd-api/src/routes/rbac.routes.ts).
 * This exercises the real app code — routing, guards, RequirePermission, the RBAC admin
 * pages — end to end in a real browser; only the network boundary is faked.
 *
 * To make this pass against a *real* backend instead: start msd-api (`npx nx serve
 * msd-api`) against a seeded Postgres (roles/permissions/dashboard widgets seeded per
 * prisma/seed.ts), remove the `page.route` interceptors below, and drive the OTP flow
 * with a real identifier — the console-logged OTP code (see otp.service.ts, logged in
 * non-production) would need to be read back out of the API's stdout or a test inbox.
 */

const API_BASE = 'http://localhost:3333/api/v1';

function fakeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.fake-signature`;
}

function envelope<T>(data: T, meta?: Record<string, unknown>) {
  return { data, error: null, ...(meta ? { meta } : {}) };
}

async function mockBootstrap(
  page: Page,
  opts: {
    permissions: string[];
    dashboardWidgets?: { key: string; title: string; order: number }[];
    roles?: { id: string; key: string; name: string; isSuperAdmin: boolean }[];
  },
) {
  await page.route(`${API_BASE}/rbac/bootstrap`, (route: Route) =>
    route.fulfill({
      json: envelope({
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com', status: 'active' },
        roles: opts.roles ?? [{ id: 'role-1', key: 'customer', name: 'Customer', isSuperAdmin: false }],
        permissions: opts.permissions,
        menu: [], // AuthProvider's `can()` is what routes/pages actually gate on, not this field.
        dashboardWidgets: opts.dashboardWidgets ?? [],
      }),
    }),
  );
}

/** Seeds `msd_auth_token` before the app's first script runs, so AuthProvider's initial-mount effect picks it up. */
async function signInWithToken(page: Page, token: string) {
  await page.addInitScript((t) => window.localStorage.setItem('msd_auth_token', t), token);
}

test.describe('RBAC — sign-in → OTP → dashboard', () => {
  test('happy path: requesting an OTP, verifying it, and landing on a role-appropriate dashboard', async ({
    page,
  }) => {
    await page.route(`${API_BASE}/auth/otp/request`, (route: Route) =>
      route.fulfill({ json: envelope({ message: 'OTP sent if the identifier is valid' }) }),
    );
    await page.route(`${API_BASE}/auth/otp/verify`, (route: Route) =>
      route.fulfill({
        json: envelope({
          accessToken: fakeJwt({ sub: 'user-1', roles: ['customer'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 }),
          refreshToken: 'fake-refresh-token',
          user: { id: 'user-1', name: 'Test User', email: null, phone: '+919876543210', roles: ['customer'] },
        }),
      }),
    );
    await mockBootstrap(page, {
      permissions: ['dashboard:view'],
      dashboardWidgets: [{ key: 'customers-count', title: 'Total Customers', order: 1 }],
    });

    await page.goto('/sign-in');
    await page.getByLabel('Phone number').fill('9876543210');
    await page.getByRole('button', { name: 'Send OTP' }).click();

    await expect(page).toHaveURL(/\/otp$/);
    await page.getByLabel(/code/i).fill('123456');
    await page.getByRole('button', { name: 'Verify & Continue' }).click();

    await expect(page).toHaveURL(/\/account\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Total Customers' })).toBeVisible();
  });
});

test.describe('RBAC — route guarding by permission', () => {
  test('a non-privileged role is redirected away from Role Management to /account/profile', async ({ page }) => {
    const token = fakeJwt({ sub: 'user-2', roles: ['customer'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, { permissions: ['dashboard:view'] }); // no rbac.roles:view

    await page.goto('/account/administration/roles');

    await expect(page).toHaveURL(/\/account\/profile$/);
  });

  test('a SuperAdmin (rbac.roles:view granted) loads the Role Management list', async ({ page }) => {
    const token = fakeJwt({ sub: 'user-3', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, {
      permissions: ['dashboard:view', 'rbac.roles:view', 'rbac.roles:edit', 'rbac.roles:create'],
      roles: [{ id: 'role-1', key: 'super_admin', name: 'Super Admin', isSuperAdmin: true }],
    });
    await page.route(`${API_BASE}/rbac/roles`, (route: Route) =>
      route.fulfill({
        json: envelope([
          {
            id: 'role-1',
            key: 'super_admin',
            name: 'Super Admin',
            description: 'Full access',
            isSystem: true,
            isSuperAdmin: true,
            isActive: true,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ]),
      }),
    );
    await page.route(`${API_BASE}/rbac/permissions/catalog`, (route: Route) =>
      route.fulfill({ json: envelope([]) }),
    );
    await page.route(`${API_BASE}/rbac/dashboard-widgets`, (route: Route) =>
      route.fulfill({ json: envelope([]) }),
    );

    await page.goto('/account/administration/roles');

    await expect(page).toHaveURL(/\/account\/administration\/roles$/);
    await expect(page.getByRole('heading', { name: 'Role Management' })).toBeVisible();
    await expect(page.locator('.role-list__name')).toContainText('Super Admin');
  });
});

test.describe('RBAC — mobile layout', () => {
  test('sign-in screen does not overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/sign-in');
    const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });
});
