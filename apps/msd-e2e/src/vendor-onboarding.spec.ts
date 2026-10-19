import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E coverage for the 4-step Member creation process (replaces the old six-step pill wizard —
 * see `TASK.md`'s "msd admin — member (vendor) console redesign" item 2):
 *   1. Owner & Login (`/account/vendors/new`, `vendor-user-picker.tsx`'s `VendorOwnerLoginStep`)
 *   2-4. Business Details → KYC Documents → Branch & Access (`vendor-pipeline.tsx`'s
 *        "Complete Profile" continuation, reached from the Member Details page)
 *
 * Same mocked-route convention as the previous version of this spec / `rbac.spec.ts`: no
 * reliably-seeded Postgres+msd-api is assumed reachable in this environment, so this runs
 * against the *real* msd dev server but intercepts every `VITE_API_URL` call via `page.route`,
 * backed by one in-memory `VendorBackend` fake so later steps see the effects of earlier ones.
 * This exercises the real app code (routing, step gating, validation) end to end in a real
 * browser; only the network boundary is faked.
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

async function mockBootstrap(page: Page, permissions: string[]) {
  await page.route(`${API_BASE}/rbac/bootstrap`, (route: Route) =>
    route.fulfill({
      json: envelope({
        user: { id: 'admin-1', name: 'Admin User', email: 'admin@example.com', status: 'active' },
        roles: [{ id: 'role-1', key: 'super_admin', name: 'Super Admin', isSuperAdmin: true }],
        permissions,
        menu: [],
        dashboardWidgets: [],
      }),
    }),
  );
}

const SERVICE_CATEGORY = { id: 'cat-svc-1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' as const };

/** A minimal in-memory stand-in for msd-api's vendor-onboarding surface. */
class VendorBackend {
  vendor: Record<string, unknown> | null = null;
  branches: Record<string, unknown>[] = [];
  documents: Record<string, unknown>[] = [];
  categoryAccess: Record<string, unknown>[] = [];
  nextId = 1;

  id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  createVendor(input: { ownerFirstName?: string; ownerLastName?: string; ownerEmail?: string; ownerMobile?: string }) {
    this.vendor = {
      id: 'vendor-1',
      businessName: null,
      slug: null,
      ownerUserId: 'user-owner-1',
      owner: { id: 'user-owner-1', name: `${input.ownerFirstName ?? ''} ${input.ownerLastName ?? ''}`.trim(), status: 'active', roles: [] },
      ownerFirstName: input.ownerFirstName,
      ownerLastName: input.ownerLastName,
      ownerEmail: input.ownerEmail,
      ownerMobile: input.ownerMobile,
      kycStatus: 'PENDING',
      kycRejectionReason: null,
      status: 'PROFILE_INCOMPLETE',
      statusReason: null,
      createdByUserId: 'admin-1',
      createdByName: 'Admin User',
      offersService: false,
      offersProduct: false,
      offersTherapy: false,
      documents: [],
      _count: { branches: 0, deals: 0, products: 0, therapists: 0 },
      liveCounts: { branches: 0, deals: 0, products: 0, therapists: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.vendor;
  }

  updateVendor(patch: Record<string, unknown>) {
    this.vendor = { ...this.vendor, ...patch, updatedAt: new Date().toISOString() };
    return this.vendor;
  }

  uploadDocument(documentType: string) {
    const doc = { id: this.id('doc'), documentType, storageKey: `vendors/vendor-1/${documentType}.pdf`, originalFilename: `${documentType}.pdf`, mimeType: 'application/pdf', sizeBytes: 1234, createdAt: new Date().toISOString() };
    this.documents = [...this.documents.filter((d) => d.documentType !== documentType), doc];
    this.vendor = { ...this.vendor, documents: this.documents };
    return doc;
  }

  addBranch(input: Record<string, unknown>) {
    const branch = { id: this.id('branch'), vendorId: 'vendor-1', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...input };
    this.branches.push(branch);
    this.vendor = {
      ...this.vendor,
      _count: { ...(this.vendor!._count as object), branches: this.branches.length },
      liveCounts: { ...(this.vendor!.liveCounts as object), branches: this.branches.length },
    };
    return branch;
  }
}

/** Registers one catch-all `/vendors*` route handler, most-specific-last (see this file's
 *  previous version for why the registration order matters with Playwright's route matching). */
async function mockVendorBackend(page: Page, backend: VendorBackend) {
  await page.route(`${API_BASE}/vendors**`, (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname === '/api/v1/vendors' && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.createVendor(body)) });
      return;
    }
    if (method === 'PATCH') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.updateVendor(body)) });
      return;
    }
    if (pathname === `/api/v1/vendors/${backend.vendor?.id}` && method === 'GET') {
      route.fulfill({ json: envelope(backend.vendor) });
      return;
    }
    route.continue();
  });

  await page.route(`${API_BASE}/vendors/users/lookup**`, (route: Route) =>
    route.fulfill({ json: envelope({ available: true, conflicts: [] }) }),
  );

  await page.route(`${API_BASE}/vendors/*/kyc-documents/**`, (route: Route) => {
    if (route.request().method() === 'POST') {
      const documentType = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
      route.fulfill({ json: envelope(backend.uploadDocument(documentType)) });
      return;
    }
    route.fulfill({ json: envelope([]) });
  });

  await page.route(`${API_BASE}/vendors/categories**`, (route: Route) => {
    const type = new URL(route.request().url()).searchParams.get('type');
    route.fulfill({ json: envelope(type === 'SERVICE' ? [SERVICE_CATEGORY] : []) });
  });

  await page.route(`${API_BASE}/vendors/*/category-access`, (route: Route) =>
    route.fulfill({ json: envelope(backend.categoryAccess) }),
  );

  await page.route(`${API_BASE}/vendors/*/branches`, (route: Route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.addBranch(body)) });
      return;
    }
    route.fulfill({ json: envelope(backend.branches) });
  });
}

test.describe('Member creation — 4-step process (Owner & Login, then Complete Profile)', () => {
  test('Step 1 (Owner & Login) opens the Member Details page immediately; Complete Profile continues Business Details -> KYC -> Branch & Access', async ({ page }) => {
    test.slow();
    const backend = new VendorBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, ['dashboard:view', 'vendors:view', 'vendors:create', 'vendors:edit', 'vendors:approve', 'vendors:reject']);
    await mockVendorBackend(page, backend);

    // ── Step 1 of 4: Owner & Login ────────────────────────────────────────────────────────
    await page.goto('/account/vendors/new');
    await expect(page.getByRole('heading', { name: 'Add New Member' })).toBeVisible();
    await expect(page.getByText('+91')).toBeVisible();

    await page.getByLabel('First name').fill('Ramesh');
    await page.getByLabel('Last name').fill('Kumar');
    await page.getByLabel('Mobile').fill('9876543210');
    await page.getByLabel('Email').fill('ramesh@example.com');
    await page.getByRole('button', { name: 'Create Login & Open Details' }).click();

    // Lands straight on the existing Member Details page (Overview), not a wizard step.
    await expect(page).toHaveURL(/\/account\/vendors\/vendor-1$/);
    await expect(page.getByRole('heading', { name: 'Ramesh Kumar' })).toBeVisible();
    await expect(page.getByText(/Created by Admin User/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Complete Business Profile' })).toBeVisible();

    // ── Steps 2-4: Complete Profile, continued from Member Details ───────────────────────
    await page.getByRole('button', { name: 'Add profile' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Step 2 of 4: Business Details' })).toBeVisible();

    await page.getByLabel('Business name').fill('Serenity Spa');
    await page.getByLabel('Business email').fill('contact@serenityspa.example');
    await page.getByRole('textbox', { name: 'Business phone' }).fill('9876500000');
    // "Business Details" bundles the address group too (per this step's own required-field set),
    // so the full address is required here, not just the business fields.
    await page.getByLabel('Address 1').fill('12 Wellness Road');
    await page.getByLabel('City').fill('Mumbai');
    await page.getByLabel('State').fill('Maharashtra');
    await page.getByLabel('PIN Code').fill('400058');
    await page.getByLabel('Map Location').fill('https://maps.google.com/?q=12+Wellness+Road');
    await page.getByRole('button', { name: 'Save & Next' }).click();
    await expect(page.getByRole('heading', { name: 'Step 3 of 4: KYC Documents' })).toBeVisible();

    // Real file upload (not a pasted URL) — one GST document is enough to satisfy "at least one".
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'gst.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake-pdf-content'),
    });
    await expect(page.getByText(/gst\.pdf/i)).toBeVisible();
    await page.getByRole('button', { name: 'Save & Next' }).click();
    await expect(page.getByRole('heading', { name: 'Step 4 of 4: Branch & Access' })).toBeVisible();

    // No Deals/Therapy/Products/Review & Submit step exists in this flow any more.
    await expect(page.getByText('Step 5')).toHaveCount(0);
    await expect(page.getByText('Review & Submit')).toHaveCount(0);

    await page.getByRole('button', { name: 'Save & Finish' }).click();

    // Back on the same Member Details page (Overview) — no separate review/submit screen.
    await expect(page).toHaveURL(/\/account\/vendors\/vendor-1$/);
    await expect(page.getByRole('heading', { name: 'Serenity Spa' })).toBeVisible();
  });

  test('required-field and mobile-format validation block submission with the exact spec messages', async ({ page }) => {
    const backend = new VendorBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, ['vendors:view', 'vendors:create']);
    await mockVendorBackend(page, backend);

    await page.goto('/account/vendors/new');
    await page.getByRole('button', { name: 'Create Login & Open Details' }).click();
    await expect(page.getByText('First name is required.')).toBeVisible();
    await expect(page.getByText('Mobile number is required.')).toBeVisible();

    await page.getByLabel('Mobile').fill('12345');
    await page.getByLabel('Mobile').blur();
    await expect(page.getByText('Enter exactly 10 digits.')).toBeVisible();

    await page.getByLabel('Mobile').fill('5123456789');
    await page.getByLabel('Mobile').blur();
    await expect(page.getByText('Mobile number must start with 6, 7, 8 or 9.')).toBeVisible();

    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Email').blur();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  });
});
