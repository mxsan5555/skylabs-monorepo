import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E coverage for the direct-category-access vendor onboarding wizard (`vendor-pipeline.tsx`)
 * and the public storefront's location/category browsing (`search.tsx` / `category/:slug`).
 *
 * Same mocked-route convention as `rbac.spec.ts`: no reliably-seeded Postgres+msd-api is assumed
 * reachable in this environment, so these specs run against the *real* msd dev server (booted by
 * the msd-e2e `webServer` config) but intercept every `VITE_API_URL` call via `page.route`,
 * feeding back fixture responses shaped like msd-api's `ApiEnvelope<T>`. A single in-memory
 * `VendorBackend` fake stands in for msd-api across the whole flow so later steps see the effects
 * of earlier ones (a created branch shows up in the branch list, a granted category shows up in
 * the Deal/Product category pickers, etc.) — this exercises the real app code (routing, the
 * wizard's step gating, the Step 6 completeness checklist) end to end in a real browser; only the
 * network boundary is faked.
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

/** The wizard's step nav button renders `<span aria-hidden="true">{stepNumber}</span>{label}` —
 *  the numeral is excluded from the accessible name (aria-hidden), so each step is addressable
 *  only by its label ("Deals", "Products", "Review & Submit", ...), scoped to the "Onboarding
 *  steps" nav landmark to avoid colliding with same-named headings/buttons elsewhere on the
 *  page. */
function wizardStep(page: Page, label: string) {
  return page.getByRole('navigation', { name: 'Onboarding steps' }).getByRole('button', { name: label });
}

/** `<md-outlined-select>` isn't a native `<select>`, so Playwright's `selectOption()` doesn't
 *  apply — it renders an ARIA `combobox` (its own accessible name, e.g. "State") that opens an
 *  `md-menu` listbox of `option`-role entries on click. `getByLabel(label)` alone is ambiguous
 *  (it matches both the combobox field AND the menu, which share the same `aria-label`), so this
 *  scopes to the combobox role explicitly, opens it, and clicks the named option. */
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
      }),
    }),
  );
}

const SERVICE_CATEGORY = { id: 'cat-svc-1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' as const };
const PRODUCT_CATEGORY = { id: 'cat-prod-1', name: 'Oils', slug: 'oils', parentId: null, isActive: true, type: 'PRODUCT' as const };
const THERAPY_CATEGORY = { id: 'cat-ther-1', name: 'Physiotherapy', slug: 'physiotherapy', parentId: null, isActive: true, type: 'THERAPY' as const };

const OWNER_USER = {
  id: 'user-owner-1',
  name: 'Priya Owner',
  email: 'priya@example.com',
  phone: '+919876500000',
  status: 'active' as const,
  roles: [{ id: 'role-vendor', key: 'vendor', name: 'Vendor' }],
};

/** A minimal in-memory stand-in for msd-api's vendor-onboarding surface — just enough state to
 *  make the wizard's own step-to-step data flow (branches -> deal picker, granted categories ->
 *  Deal/Product category pickers, products/deals -> Step 6's recap) behave like the real backend
 *  across a full run through the UI. */
class VendorBackend {
  vendor: Record<string, unknown> | null = null;
  branches: Record<string, unknown>[] = [];
  deals: Record<string, unknown>[] = [];
  products: Record<string, unknown>[] = [];
  categoryAccess: { id: string; vendorId: string; categoryId: string; createdAt: string; category: typeof SERVICE_CATEGORY }[] = [];
  nextId = 1;

  id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  createVendor(ownerUserId: string) {
    this.vendor = {
      id: 'vendor-1',
      businessName: null,
      slug: null,
      ownerUserId,
      owner: OWNER_USER,
      kycStatus: 'PENDING',
      kycRejectionReason: null,
      status: 'PROFILE_INCOMPLETE',
      statusReason: null,
      offersService: false,
      offersProduct: false,
      offersTherapy: false,
      kycDocuments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return this.vendor;
  }

  updateVendor(patch: Record<string, unknown>) {
    this.vendor = { ...this.vendor, ...patch, updatedAt: new Date().toISOString() };
    return this.vendor;
  }

  setModulesAndAccess(input: { offersService: boolean; offersProduct: boolean; offersTherapy: boolean; categoryIds: string[] }) {
    this.updateVendor({ offersService: input.offersService, offersProduct: input.offersProduct, offersTherapy: input.offersTherapy });
    const catalog = [SERVICE_CATEGORY, PRODUCT_CATEGORY, THERAPY_CATEGORY];
    this.categoryAccess = input.categoryIds.map((categoryId) => ({
      id: this.id('access'),
      vendorId: (this.vendor as { id: string }).id,
      categoryId,
      createdAt: new Date().toISOString(),
      category: catalog.find((c) => c.id === categoryId)!,
    }));
    return this.categoryAccess;
  }

  addBranch(input: Record<string, unknown>) {
    const branch = { id: this.id('branch'), vendorId: (this.vendor as { id: string }).id, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...input };
    this.branches.push(branch);
    return branch;
  }

  addDeal(branchId: string, input: Record<string, unknown>) {
    const category = [SERVICE_CATEGORY, PRODUCT_CATEGORY].find((c) => c.id === input.categoryId) ?? SERVICE_CATEGORY;
    const deal = {
      id: this.id('deal'),
      vendorId: (this.vendor as { id: string }).id,
      branchId,
      status: 'ACTIVE',
      approvalStatus: 'PENDING',
      category,
      product: null,
      packages: (input.packages as unknown[])?.map((p, i) => ({ id: this.id('pkg'), dealId: `deal-${i}`, isActive: true, sortOrder: i, ...(p as object) })) ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...input,
    };
    this.deals.push(deal);
    return deal;
  }

  addProduct(input: Record<string, unknown>) {
    const category = [SERVICE_CATEGORY, PRODUCT_CATEGORY].find((c) => c.id === input.categoryId) ?? PRODUCT_CATEGORY;
    const product = {
      id: this.id('product'),
      vendorId: (this.vendor as { id: string }).id,
      isActive: true,
      isNew: false,
      isFeatured: false,
      category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...input,
    };
    this.products.push(product);
    return product;
  }
}

/** Registers one catch-all route handler covering every `/vendors*`, `/vendors/categories*`,
 *  `/vendors/users/search*` call the wizard makes, backed by the shared `VendorBackend` state. */
async function mockVendorBackend(page: Page, backend: VendorBackend) {
  // Playwright matches routes in REVERSE registration order (most-recently-registered wins), and
  // a single-segment glob like `/vendors/*` matches `/vendors/categories` and `/vendors/users`
  // just as much as it matches `/vendors/<id>` — so the generic `/vendors/:id` PATCH catch-all
  // is registered FIRST here (lowest priority), and every more specific path below it is
  // registered AFTER (so it wins the match). Getting this backwards silently sends
  // `/vendors/categories`-type requests through `route.continue()` to a real (unreachable)
  // localhost:3333, which just hangs until the test times out — the exact failure this ordering
  // avoids.
  // `**` (not an exact/plain string) so this also matches `/vendors?page=1&pageSize=10&search=`
  // (the admin list call, which always carries query params) as well as the bare `/vendors/:id`
  // PATCH — a plain `${API_BASE}/vendors` pattern only matches a request with NO query string at
  // all, silently missing the real list call and sending it to an unreachable localhost:3333.
  await page.route(`${API_BASE}/vendors**`, (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname === '/api/v1/vendors' && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.createVendor(body.ownerUserId)) });
      return;
    }
    if (pathname === '/api/v1/vendors' && method === 'GET') {
      route.fulfill({ json: envelope(backend.vendor ? [backend.vendor] : [], { total: backend.vendor ? 1 : 0 }) });
      return;
    }
    if (method === 'PATCH') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.updateVendor(body)) });
      return;
    }
    route.continue();
  });

  await page.route(`${API_BASE}/vendors/users/search**`, (route: Route) =>
    route.fulfill({ json: envelope([OWNER_USER]) }),
  );

  await page.route(`${API_BASE}/vendors/categories**`, (route: Route) => {
    const url = new URL(route.request().url());
    const type = url.searchParams.get('type');
    const catalog = { SERVICE: [SERVICE_CATEGORY], PRODUCT: [PRODUCT_CATEGORY], THERAPY: [] as (typeof SERVICE_CATEGORY)[] };
    route.fulfill({ json: envelope(type ? catalog[type as keyof typeof catalog] ?? [] : []) });
  });

  await page.route(`${API_BASE}/vendors/*/category-access`, (route: Route) => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.setModulesAndAccess(body)) });
      return;
    }
    route.fulfill({ json: envelope(backend.categoryAccess) });
  });

  await page.route(`${API_BASE}/vendors/*/branches/*/deals`, (route: Route) => {
    if (route.request().method() === 'POST') {
      const branchId = new URL(route.request().url()).pathname.split('/')[4];
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.addDeal(branchId, body)) });
      return;
    }
    const branchId = new URL(route.request().url()).pathname.split('/')[4];
    route.fulfill({ json: envelope(backend.deals.filter((d) => d.branchId === branchId)) });
  });

  await page.route(`${API_BASE}/vendors/*/branches`, (route: Route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.addBranch(body)) });
      return;
    }
    route.fulfill({ json: envelope(backend.branches) });
  });

  await page.route(`${API_BASE}/vendors/*/products**`, (route: Route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.addProduct(body)) });
      return;
    }
    route.fulfill({ json: envelope(backend.products) });
  });

  await page.route(`${API_BASE}/vendors/*/therapists`, (route: Route) => route.fulfill({ json: envelope([]) }));

  await page.route(`${API_BASE}/vendors/*/approve`, (route: Route) =>
    route.fulfill({ json: envelope(backend.updateVendor({ status: 'ACTIVE' })) }),
  );
}

test.describe('Vendor onboarding wizard — direct category access, happy path', () => {
  test('create vendor -> profile/KYC -> branches+modules+categories -> deal -> product -> review -> approve', async ({ page }) => {
    test.slow();
    const backend = new VendorBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, [
      'dashboard:view',
      'vendors:view',
      'vendors:create',
      'vendors:edit',
      'vendors:approve',
      'vendors:reject',
      'vendors:status_change',
    ]);
    await mockVendorBackend(page, backend);

    await page.goto('/account/vendors/new');
    await expect(page.getByRole('heading', { name: 'Add New Vendor' })).toBeVisible();

    // ── Pick the vendor's owner user, create the vendor row ──────────────────────────────
    await page.getByLabel(/Search existing user/i).fill('Priya');
    await page.getByRole('button', { name: /Priya Owner/ }).click();
    await page.getByRole('button', { name: 'Create Vendor' }).click();
    await expect(page.getByRole('heading', { name: 'Step 1: Profile & KYC' })).toBeVisible();

    // ── Step 1 — Profile & KYC ────────────────────────────────────────────────────────────
    await page.getByLabel('Business name').fill('Serenity Spa');
    await page.getByLabel('Business email').fill('contact@serenityspa.example');
    await page.getByLabel('Address', { exact: true }).fill('12 Wellness Road');
    await page.getByLabel('GST number').fill('27AAAAA0000A1Z5');
    await page.getByLabel('PAN number').fill('AAAAA0000A');
    await page.getByRole('button', { name: 'Add document' }).click();
    await page.getByLabel('Document type').fill('GST Certificate');
    await page.getByLabel('Document URL').fill('https://example.com/gst.pdf');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Upload at least one KYC document')).toHaveCount(0);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Step 2: Branches, Modules & Category Access' })).toBeVisible();

    // ── Step 2 — Business Modules + Category Access ──────────────────────────────────────
    await page.getByRole('checkbox', { name: 'Service' }).check();
    await page.getByRole('checkbox', { name: 'Product' }).check();
    await page.getByRole('checkbox', { name: 'Massage' }).check();
    await page.getByRole('checkbox', { name: 'Oils' }).check();
    await page.getByRole('button', { name: 'Save modules & category access' }).click();
    await expect(page.getByText('Business modules and category access saved successfully')).toBeVisible();

    // ── Step 2 — Branch (with State/City) ─────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Add branch' }).click();
    await page.getByLabel('Branch Name').fill('Serenity Spa - Andheri');
    await selectMaterialOption(page, 'State', 'Maharashtra');
    await selectMaterialOption(page, 'City', 'Mumbai');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Serenity Spa - Andheri')).toBeVisible();

    // ── Step 3 — Deals ────────────────────────────────────────────────────────────────────
    await wizardStep(page, 'Deals').click();
    await expect(page.getByRole('heading', { name: 'Step 3: Deals' })).toBeVisible();
    await page.getByRole('button', { name: 'Add deal' }).click();
    await selectMaterialOption(page, 'Category', SERVICE_CATEGORY.name);
    await page.getByLabel('Title').fill('Signature Deep Tissue Massage');
    await page.getByLabel('Slug').fill('signature-deep-tissue-massage');
    await page.getByText('Packages', { exact: true }).click();
    await page.getByRole('button', { name: 'Add package' }).click();
    await page.getByLabel('Duration (minutes)').fill('60');
    await page.getByLabel('Selling price').fill('1499');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Signature Deep Tissue Massage')).toBeVisible();
    // A fresh create deliberately keeps the dialog open afterward (so MediaUploader can flush
    // any staged photos against the new id — see DealDialog's own doc comment); close it
    // manually before navigating to the next step.
    await page.getByRole('button', { name: 'Cancel' }).click();

    // ── Step 5 — Products ─────────────────────────────────────────────────────────────────
    await wizardStep(page, 'Products').click();
    await expect(page.getByRole('heading', { name: 'Step 5: Products' })).toBeVisible();
    await page.getByRole('button', { name: 'Add product' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Signature Massage Oil');
    await page.getByLabel('Slug').fill('signature-massage-oil');
    await page.getByLabel('Price', { exact: true }).fill('499');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Signature Massage Oil')).toBeVisible();
    // Same "stays open for media upload after create" behavior as DealDialog above.
    await page.getByRole('button', { name: 'Cancel' }).click();

    // ── Step 6 — Review & completeness checklist ─────────────────────────────────────────
    await wizardStep(page, 'Review & Submit').click();
    await expect(page.getByRole('heading', { name: 'Step 6: Review & Submit' })).toBeVisible();
    const checklist = page.locator('.entity-list');
    await expect(checklist.getByText('Business name, email, address, GST and PAN filled in')).toBeVisible();
    // Every checklist row's own status pill should read "Done" — none "Missing" — since every
    // gate (KYC doc, branch+state, both modules' granted categories) was satisfied above.
    await expect(page.getByText('Missing')).toHaveCount(0);
    await expect(page.getByText('This vendor is ready for approval.').or(page.getByRole('button', { name: 'Approve vendor' }))).toBeVisible();

    // ── Approve — via the admin vendor detail page (the wizard's own Step 6 here has no
    // Approve/Reject action since VendorNewPage doesn't grant it — see vendor-pipeline.tsx's
    // own doc comment on why Approve/Reject only appear from the admin vendor list). ─────────
    await page.getByRole('button', { name: 'Done — View Vendor' }).click();
    await expect(page).toHaveURL(/\/account\/vendors\?vendorId=/);
    await expect(page.getByRole('heading', { name: 'Serenity Spa' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Vendor approved and activated.')).toBeVisible();
  });
});

test.describe('Public storefront — location filter and category pages still render', () => {
  test('/explore renders with a location filter and narrows to /category/:slug', async ({ page }) => {
    await page.route(`${API_BASE}/catalog/categories`, (route: Route) =>
      route.fulfill({ json: envelope([{ ...SERVICE_CATEGORY, description: null, children: [], isPopular: true, sortOrder: 1 }]) }),
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
