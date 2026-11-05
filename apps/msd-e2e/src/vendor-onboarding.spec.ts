import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E coverage for staff member onboarding (the short Add member form, then the member detail
 * page with its status actions) and the public storefront's location/category browsing
 * (`search.tsx` / `category/:slug`).
 *
 * Same mocked-route convention as `rbac.spec.ts`: no seeded Postgres and msd-api is assumed
 * reachable here, so these specs run against the real msd dev server (booted by the msd-e2e
 * `webServer` config) and intercept every `VITE_API_URL` call with `page.route`, answering with
 * fixtures shaped like msd-api's `ApiEnvelope<T>`. One in-memory `MemberBackend` stands in for
 * the `/members` API across the flow, so later steps see the effects of earlier ones (the created
 * member opens on its detail page, a status change shows in the header). Only the network
 * boundary is faked.
 */

const API_BASE = 'http://localhost:3333/api/v1';

function fakeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.fake-signature`;
}

function envelope<T>(data: T, meta?: Record<string, unknown>) {
  return { data, error: null, ...(meta ? { meta } : {}) };
}

async function signInWithToken(page: Page, token: string) {
  await page.addInitScript((t) => window.localStorage.setItem('msd_auth_token', t), token);
}

/** `<md-outlined-select>` is not a native `<select>`, so Playwright's `selectOption()` does not
 *  apply. It renders an ARIA `combobox` that opens an `md-menu` listbox of `option` entries. */
async function selectMaterialOption(page: Page, comboboxLabel: string, optionText: string) {
  await page.getByRole('combobox', { name: comboboxLabel, exact: true }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

async function mockBootstrap(page: Page, permissions: string[]) {
  await page.route(`${API_BASE}/rbac/bootstrap`, (route: Route) =>
    route.fulfill({
      json: envelope({
        user: { id: 'admin-1', name: 'Admin User', email: 'admin@example.com', status: 'active' },
        roles: [{ id: 'role-1', key: 'super_admin', name: 'Super Admin', isSuperAdmin: true }],
        permissions,
        menu: [],
        dashboardWidgets: [],
        member: null,
      }),
    }),
  );
}

interface MemberCreateBody {
  businessName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerMobile: string;
}

/** A minimal in-memory stand-in for msd-api's `/members` admin surface. */
class MemberBackend {
  member: Record<string, unknown> | null = null;
  createBodies: MemberCreateBody[] = [];
  statusChanges: { status: string; reason: string }[] = [];

  create(body: MemberCreateBody) {
    this.createBodies.push(body);
    const now = new Date().toISOString();
    this.member = {
      id: 'member-1',
      businessName: body.businessName,
      slug: null,
      ownerUserId: 'user-owner-1',
      owner: {
        id: 'user-owner-1',
        name: `${body.ownerFirstName} ${body.ownerLastName}`,
        email: body.ownerEmail,
        phone: `+91${body.ownerMobile}`,
        status: 'active',
      },
      kycStatus: 'PENDING',
      kycRejectionReason: null,
      status: 'ACTIVE',
      statusReason: null,
      reviewFlaggedAt: null,
      documentsSummary: { complete: false, dueAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), overdue: false },
      offersService: false,
      offersProduct: false,
      offersTherapy: false,
      createdAt: now,
      updatedAt: now,
    };
    return this.member;
  }

  changeStatus(body: { status: string; reason: string }) {
    this.statusChanges.push(body);
    this.member = { ...this.member, status: body.status, statusReason: body.reason, updatedAt: new Date().toISOString() };
    return this.member;
  }
}

async function mockMemberBackend(page: Page, backend: MemberBackend) {
  // Lookups the profile form or layout may make under `/vendors` get an empty answer, never a
  // pass-through to the unreachable real API (which would hang until the test times out).
  await page.route(`${API_BASE}/vendors**`, (route: Route) => route.fulfill({ json: envelope([]) }));

  await page.route(`${API_BASE}/members**`, (route: Route) => {
    const method = route.request().method();
    const segments = new URL(route.request().url()).pathname.replace('/api/v1/', '').split('/');
    // segments: ['members', ':id'?, 'status' | 'activity' | 'status-history' | 'documents'?]
    if (segments.length === 1 && method === 'POST') {
      route.fulfill({ status: 201, json: envelope(backend.create(JSON.parse(route.request().postData() ?? '{}'))) });
      return;
    }
    if (segments.length === 1 && method === 'GET') {
      route.fulfill({ json: envelope(backend.member ? [backend.member] : [], { total: backend.member ? 1 : 0 }) });
      return;
    }
    if (segments.length === 2 && method === 'GET') {
      if (backend.member) route.fulfill({ json: envelope(backend.member) });
      else route.fulfill({ status: 404, json: { data: null, error: { code: 'NOT_FOUND', message: 'Member not found.' } } });
      return;
    }
    if (segments[2] === 'status' && method === 'PATCH') {
      route.fulfill({ json: envelope(backend.changeStatus(JSON.parse(route.request().postData() ?? '{}'))) });
      return;
    }
    // activity, status-history and documents: nothing recorded yet.
    route.fulfill({ json: envelope([]) });
  });
}

/** The status chip in the detail page header (a light DOM `sky-badge`). */
function statusBadge(page: Page, label: string) {
  return page.locator('sky-badge').filter({ hasText: new RegExp(`^${label}$`) });
}

const MEMBER_PERMISSIONS =['dashboard:view', 'members:view', 'members:create', 'members:edit', 'members:status_change'];

test.describe('Add member, then manage it from the member detail page', () => {
  test('creates a member with the short form and makes it inactive with a reason', async ({ page }) => {
    test.slow();
    const backend = new MemberBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, MEMBER_PERMISSIONS);
    await mockMemberBackend(page, backend);

    await page.goto('/account/members/new');
    await expect(page.getByRole('heading', { name: 'Add member', level: 1 })).toBeVisible();

    await page.getByLabel('Business name').fill('Serenity Spa');
    await page.getByLabel('Owner first name').fill('Priya');
    await page.getByLabel('Owner last name').fill('Shah');
    await page.getByLabel('Owner email').fill('priya@example.com');
    await page.getByLabel('Owner mobile number').fill('9876500000');
    await page.getByRole('button', { name: 'Create member' }).click();

    // The form posts the five fields and lands on the new member's detail page.
    await expect(page).toHaveURL(/\/account\/members\/member-1$/);
    expect(backend.createBodies).toEqual([
      {
        businessName: 'Serenity Spa',
        ownerFirstName: 'Priya',
        ownerLastName: 'Shah',
        ownerEmail: 'priya@example.com',
        ownerMobile: '9876500000',
      },
    ]);
    await expect(page.getByRole('heading', { name: 'Serenity Spa', level: 1 })).toBeVisible();
    await expect(statusBadge(page, 'Active')).toBeVisible();
    await expect(page.locator('sky-badge').filter({ hasText: 'Documents incomplete' })).toBeVisible();

    // Make inactive needs a reason of at least 10 characters, then sends it with the status.
    const reason = 'Owner asked to pause listings for a month';
    await page.getByRole('button', { name: 'Make inactive' }).click();
    await page.getByLabel('Reason (10 to 500 characters)').fill(reason);
    await page.getByRole('button', { name: 'Confirm make inactive' }).click();

    await expect(page.getByText('Member is inactive and view only.')).toBeVisible();
    expect(backend.statusChanges).toEqual([{ status: 'INACTIVE', reason }]);
    await expect(statusBadge(page, 'Inactive')).toBeVisible();
    await expect(page.getByText(/This member is inactive and view only\./)).toBeVisible();
    // An inactive member offers Reactivate instead of Make inactive.
    await expect(page.getByRole('button', { name: 'Reactivate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make inactive' })).toHaveCount(0);
  });

  test('blocks an empty Add member form on the client and never calls the API', async ({ page }) => {
    const backend = new MemberBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, MEMBER_PERMISSIONS);
    await mockMemberBackend(page, backend);

    await page.goto('/account/members/new');
    await page.getByRole('button', { name: 'Create member' }).click();

    await expect(page.getByText('Enter the business name.')).toBeVisible();
    await expect(page.getByText('Enter a valid 10-digit mobile number.')).toBeVisible();
    await expect(page).toHaveURL(/\/account\/members\/new$/);
    expect(backend.createBodies).toHaveLength(0);
  });

  test('shows the not found state when the member id does not exist', async ({ page }) => {
    const backend = new MemberBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, MEMBER_PERMISSIONS);
    await mockMemberBackend(page, backend);

    await page.goto('/account/members/missing-member');
    await expect(page.getByText('Member not found.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to all members' })).toBeVisible();
  });
});

test.describe('Public storefront: location filter and category pages still render', () => {
  test('/explore renders with a location filter and narrows to /category/:slug', async ({ page }) => {
    const SERVICE_CATEGORY = { id: 'cat-svc-1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' as const };
    await page.route(`${API_BASE}/catalog/categories`, (route: Route) =>
      route.fulfill({ json: envelope([{ ...SERVICE_CATEGORY, description: null, children: [], sortOrder: 1 }]) }),
    );
    await page.route(`${API_BASE}/catalog/categories/massage`, (route: Route) =>
      route.fulfill({ json: envelope({ ...SERVICE_CATEGORY, description: null, children: [] }) }),
    );
    await page.route(`${API_BASE}/catalog/locations`, (route: Route) =>
      route.fulfill({ json: envelope([{ state: 'Maharashtra', city: 'Mumbai' }]) }),
    );
    await page.route(`${API_BASE}/catalog/deals**`, (route: Route) => route.fulfill({ json: envelope([]) }));

    await page.goto('/explore');
    await expect(page.getByRole('search')).toBeVisible();
    // The Location filter chip is present and opens a State/City picker.
    await page.getByRole('button', { name: /Location/ }).click();
    await expect(page.getByRole('combobox', { name: 'State', exact: true })).toBeVisible();
    await selectMaterialOption(page, 'State', 'Maharashtra');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/state=Maharashtra/);

    await page.goto('/category/massage');
    await expect(page.getByRole('heading', { name: 'Massage' })).toBeVisible();
  });
});
