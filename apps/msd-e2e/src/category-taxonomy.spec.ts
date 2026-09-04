import path from 'path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E coverage for the 3-level Category/Subcategory/Type taxonomy reset + image upload.
 *
 * Same mocked-route convention as `rbac.spec.ts`/`vendor-onboarding.spec.ts`: runs against the
 * *real* msd dev server (booted by the msd-e2e `webServer` config) but intercepts every
 * `VITE_API_URL` (`http://localhost:3333/api/v1`) call via `page.route`, feeding back fixture
 * responses shaped like msd-api's `ApiEnvelope<T>`. Only the network boundary is faked — routing,
 * guards, the cascading category pickers, and (for the image-upload scenario) the real
 * canvas-based client-side compression in `utils/image-compression.ts` all run for real in a real
 * browser, which is also why this suite (unlike the Vitest unit suites) CAN drive actual select
 * interactions end to end — the jsdom + `@lit/react` + React 19 event-binding gap documented in
 * `categories.test.tsx`/`vendor-branches.test.tsx` is a jsdom-only limitation; Chromium's real
 * Shadow DOM/custom-element runtime doesn't have it.
 */

const API_BASE = 'http://localhost:3333/api/v1';
const TEST_PHOTO = path.join(__dirname, 'fixtures', 'test-photo.jpg');

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

/** `<md-outlined-select>` isn't a native `<select>` — it opens an `md-menu` listbox on click.
 *
 * NOTE, refining `vendor-onboarding.spec.ts`'s version of this helper: `<md-dialog>`'s `:host`
 * is `display:contents` regardless of its own `open` attribute (only its shadow-internal native
 * `<dialog>` toggles real visibility), so on a page that mounts more than one same-shaped dialog
 * at once (e.g. `CategoryManagement`'s always-present Add + empty-Edit pair), an unscoped
 * `getByRole('combobox', ...)` can resolve to more than one same-labeled control. `scope`
 * defaults to `page` (fine for the vendor wizard's dialogs, which are never mounted in such
 * pairs) but should be passed explicitly (e.g. `page.locator('md-dialog[open]')`) wherever more
 * than one matching dialog may be mounted at once. `option`s render into a top-level `md-menu`
 * outside any dialog, so that half of the lookup is always unscoped. */
async function selectMaterialOption(page: Page, comboboxLabel: string, optionText: string, scope: Page | ReturnType<Page['locator']> = page) {
  await scope.getByRole('combobox', { name: comboboxLabel, exact: true }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  type: 'SERVICE' | 'PRODUCT' | 'THERAPY' | null;
  isPopular: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent?: { id: string; name: string } | null;
  _count: { children: number };
  mediaImages: { id: string; storageKey: string; originalFilename: string | null; mimeType: string; sizeBytes: number; sortOrder: number; isPrimary: boolean }[];
}

/** A minimal in-memory stand-in for msd-api's admin Category CRUD + image-upload surface —
 *  enough to drive the real `CategoryManagement` (`scope="top"|"sub"|"leaf"`) admin screens
 *  through a full 3-level create, including an image upload against the freshly-created Type row. */
class CategoryBackend {
  categories: CategoryRecord[] = [];
  nextId = 1;

  create(input: Partial<CategoryRecord>): CategoryRecord {
    const id = `cat-${this.nextId++}`;
    const parent = input.parentId ? this.categories.find((c) => c.id === input.parentId) : undefined;
    const record: CategoryRecord = {
      id,
      name: input.name ?? '',
      slug: input.slug ?? '',
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
      type: input.parentId ? null : (input.type ?? 'SERVICE'),
      isPopular: input.isPopular ?? false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parent: parent ? { id: parent.id, name: parent.name } : null,
      _count: { children: 0 },
      mediaImages: [],
    };
    this.categories.push(record);
    if (parent) parent._count.children += 1;
    return record;
  }

  listByScope(scope: 'top' | 'sub' | 'leaf' | undefined): CategoryRecord[] {
    return this.categories.filter((c) => {
      if (scope === 'top') return c.parentId === null;
      const parent = c.parentId ? this.categories.find((p) => p.id === c.parentId) : undefined;
      if (scope === 'sub') return c.parentId !== null && parent?.parentId === null;
      if (scope === 'leaf') return c.parentId !== null && parent?.parentId !== null && parent?.parentId !== undefined;
      return true;
    });
  }

  addImage(categoryId: string, filename: string) {
    const category = this.categories.find((c) => c.id === categoryId);
    if (!category) throw new Error(`Unknown category ${categoryId}`);
    const image = {
      id: `img-${category.mediaImages.length + 1}`,
      storageKey: `categories/${categoryId}/${filename}`,
      originalFilename: filename,
      mimeType: 'image/jpeg',
      sizeBytes: 50_000,
      sortOrder: category.mediaImages.length,
      isPrimary: category.mediaImages.length === 0,
    };
    category.mediaImages.push(image);
    return image;
  }
}

async function mockCategoryBackend(page: Page, backend: CategoryBackend) {
  await page.route(`${API_BASE}/categories**`, (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const pathname = url.pathname.replace('/api/v1', '');
    const segments = pathname.split('/').filter(Boolean); // ['categories', ':id'?, 'images'?, ...]

    if (segments.length === 1 && method === 'GET') {
      const scope = url.searchParams.get('scope') as 'top' | 'sub' | 'leaf' | null;
      const data = backend.listByScope(scope ?? undefined);
      route.fulfill({ json: envelope(data, { total: data.length }) });
      return;
    }
    if (segments.length === 1 && method === 'POST') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({ json: envelope(backend.create(body)) });
      return;
    }
    if (segments.length === 3 && segments[2] === 'images' && method === 'POST') {
      // Multipart upload — the fixture's filename is enough for this fake; no real disk write.
      const image = backend.addImage(segments[1], 'test-photo.jpg');
      route.fulfill({ json: envelope(image) });
      return;
    }
    route.fulfill({ json: envelope(null) });
  });
}

test.describe('Admin — Category -> Subcategory -> Type creation with an image on the Type row', () => {
  test('creates a 3-level chain across the 3 admin screens and uploads an image on the new Type row', async ({ page }) => {
    test.slow();
    const backend = new CategoryBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, [
      'dashboard:view',
      'masters.categories:view',
      'masters.categories:create',
      'masters.categories:edit',
      'masters.sub-categories:view',
    ]);
    await mockCategoryBackend(page, backend);

    // `CategoryManagement` always mounts BOTH an Add dialog AND an empty Edit dialog side by
    // side (see `categories.tsx`'s own doc comment + `categories.test.tsx`'s identical
    // discovery), and `<md-dialog>`'s `:host` is `display:contents` regardless of its own
    // `open` attribute — only its shadow-internal native `<dialog>` toggles real visibility —
    // so unlike a typical modal, an unscoped `getByLabel`/`getByRole` query can resolve to BOTH
    // dialogs' same-labeled fields at once. Every interaction below is scoped to the one
    // `<md-dialog open>` at a time to avoid that ambiguity.
    const openDialog = () => page.locator('md-dialog[open]');

    // ── Screen 1 — Categories (top-level) ────────────────────────────────────────────────
    await page.goto('/account/masters/categories');
    await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
    await page.getByRole('button', { name: 'Add category' }).click();
    await openDialog().getByLabel('Name', { exact: true }).fill('Wellness Retreats');
    await openDialog().getByLabel('Slug', { exact: true }).fill('wellness-retreats');
    await openDialog().getByRole('button', { name: 'Save', exact: true }).click();
    // A fresh create keeps the dialog open (so MediaUploader can flush any staged photos) — close
    // it manually, same precedent as `vendor-onboarding.spec.ts`.
    await expect(page.getByText('Saved.')).toBeVisible();
    await openDialog().getByRole('button', { name: 'Cancel' }).click();
    expect(backend.categories.some((c) => c.name === 'Wellness Retreats' && c.parentId === null)).toBe(true);

    // ── Screen 2 — Sub Categories ─────────────────────────────────────────────────────────
    await page.goto('/account/masters/sub-categories');
    await expect(page.getByRole('heading', { name: 'Sub Categories' })).toBeVisible();
    await page.getByRole('button', { name: 'Add subcategory' }).click();
    await selectMaterialOption(page, 'Parent category', 'Wellness Retreats', openDialog());
    await openDialog().getByLabel('Name', { exact: true }).fill('Yoga Retreats');
    await openDialog().getByLabel('Slug', { exact: true }).fill('yoga-retreats');
    await openDialog().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await openDialog().getByRole('button', { name: 'Cancel' }).click();
    const wellnessRetreats = backend.categories.find((c) => c.name === 'Wellness Retreats')!;
    expect(backend.categories.some((c) => c.name === 'Yoga Retreats' && c.parentId === wellnessRetreats.id)).toBe(true);

    // ── Screen 3 — Category Types (the new Type tier) ─────────────────────────────────────
    await page.goto('/account/masters/category-types');
    await expect(page.getByRole('heading', { name: 'Category Types' })).toBeVisible();
    await page.getByRole('button', { name: 'Add type' }).click();
    await selectMaterialOption(page, 'Category', 'Wellness Retreats', openDialog());
    await selectMaterialOption(page, 'Subcategory', 'Yoga Retreats', openDialog());
    await openDialog().getByLabel('Name', { exact: true }).fill('Weekend Yoga Retreat');
    await openDialog().getByLabel('Slug', { exact: true }).fill('weekend-yoga-retreat');
    await openDialog().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    const yogaRetreats = backend.categories.find((c) => c.name === 'Yoga Retreats')!;
    const typeRow = backend.categories.find((c) => c.name === 'Weekend Yoga Retreat');
    expect(typeRow?.parentId).toBe(yogaRetreats.id); // the 2-step cascade set the correct grandparent-of-parent chain

    // ── Upload an image on the freshly-created Type row (dialog stayed open after create) ──
    await expect(openDialog().getByText('Upload images')).toBeVisible();
    await openDialog().locator('input[type="file"]').first().setInputFiles(TEST_PHOTO);
    await expect(openDialog().getByText('test-photo.jpg')).toBeVisible({ timeout: 20_000 });
    await expect(openDialog().getByText('★ Primary')).toBeVisible();
    expect(typeRow?.mediaImages.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────

interface DealBody {
  categoryId: string;
  subcategoryId?: string;
  [key: string]: unknown;
}

/** Trimmed-down stand-in for the vendor-onboarding wizard's backend surface (see the fuller
 *  `VendorBackend` in `vendor-onboarding.spec.ts`) — only what's needed to reach Step 3 (Deals)
 *  and save one: create the vendor, add one branch, record the Deal actually submitted. The
 *  wizard's step nav buttons aren't gated on earlier steps being complete (`setActiveStep` is
 *  unconditional — see `vendor-pipeline.tsx`), so this test jumps straight to Step 2 (just to add
 *  a branch) and Step 3, skipping Step 1's own KYC fields entirely — nothing under test here
 *  depends on them. */
class DealsOnlyVendorBackend {
  vendor: Record<string, unknown> | null = null;
  branches: Record<string, unknown>[] = [];
  deals: DealBody[] = [];
  nextId = 1;

  id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  createVendor() {
    this.vendor = {
      id: 'vendor-1',
      businessName: null,
      slug: null,
      owner: { id: 'user-owner-1', name: 'Priya Owner', email: 'priya@example.com', phone: '+919876500000', status: 'active' },
      kycStatus: 'PENDING',
      status: 'PROFILE_INCOMPLETE',
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

  addBranch(input: Record<string, unknown>) {
    const branch = { id: this.id('branch'), vendorId: 'vendor-1', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...input };
    this.branches.push(branch);
    return branch;
  }

  addDeal(branchId: string, input: DealBody) {
    const deal = {
      id: this.id('deal'),
      vendorId: 'vendor-1',
      branchId,
      status: 'ACTIVE',
      approvalStatus: 'PENDING',
      product: null,
      packages: (input.packages as unknown[] | undefined)?.map((p, i) => ({ id: this.id('pkg'), isActive: true, sortOrder: i, ...(p as object) })) ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...input,
    };
    this.deals.push(deal);
    return deal;
  }
}

const TOP_MASSAGE = { id: 'cat-massage', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' as const };
const SUB_BODY_MASSAGE = { id: 'cat-body-massage', name: 'Body Massage', slug: 'body-massage', parentId: 'cat-massage', isActive: true };
const TYPE_SWEDISH = { id: 'cat-swedish-massage', name: 'Swedish Massage', slug: 'swedish-massage', parentId: 'cat-body-massage', isActive: true };
// A flat list of top + subcategory + Type-tier rows — exactly the shape `listActiveCategories`
// returns for a vendor's granted SERVICE categories per the 2-hop extension (see
// `category.service.ts`'s own doc comment and `utils/category-tree.ts`'s `resolveCategoryTiers`).
const GRANTED_SERVICE_CATEGORIES = [TOP_MASSAGE, SUB_BODY_MASSAGE, TYPE_SWEDISH];

async function mockDealsOnlyVendorBackend(page: Page, backend: DealsOnlyVendorBackend) {
  await page.route(`${API_BASE}/vendors**`, (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname === '/api/v1/vendors' && method === 'POST') {
      route.fulfill({ json: envelope(backend.createVendor()) });
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
    route.fulfill({ json: envelope([{ id: 'user-owner-1', name: 'Priya Owner', email: 'priya@example.com', phone: '+919876500000', status: 'active', roles: [] }]) }),
  );

  await page.route(`${API_BASE}/vendors/categories**`, (route: Route) => {
    const type = new URL(route.request().url()).searchParams.get('type');
    route.fulfill({ json: envelope(type === 'SERVICE' ? GRANTED_SERVICE_CATEGORIES : []) });
  });

  await page.route(`${API_BASE}/vendors/*/category-access`, (route: Route) => route.fulfill({ json: envelope([]) }));

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

  await page.route(`${API_BASE}/vendors/*/products**`, (route: Route) => route.fulfill({ json: envelope([]) }));
  await page.route(`${API_BASE}/vendors/*/therapists`, (route: Route) => route.fulfill({ json: envelope([]) }));
}

test.describe('Vendor — creating a Deal drilling into a Type-level category', () => {
  test('picks Massage -> Body Massage -> Swedish Massage and the Deal is submitted with the Type-tier id as subcategoryId', async ({ page }) => {
    test.slow();
    const backend = new DealsOnlyVendorBackend();
    const token = fakeJwt({ sub: 'admin-1', roles: ['super_admin'], app: 'msd', exp: Math.floor(Date.now() / 1000) + 3600 });
    await signInWithToken(page, token);
    await mockBootstrap(page, ['dashboard:view', 'vendors:view', 'vendors:create', 'vendors:edit']);
    await mockDealsOnlyVendorBackend(page, backend);

    await page.goto('/account/vendors/new');
    await page.getByLabel(/Search existing user/i).fill('Priya');
    await page.getByRole('button', { name: /Priya Owner/ }).click();
    await page.getByRole('button', { name: 'Create Vendor' }).click();
    await expect(page.getByRole('heading', { name: 'Step 1: Profile & KYC' })).toBeVisible();

    // Step nav buttons aren't gated on earlier steps — jump straight to Step 2 just to add a
    // branch (Step 3 needs at least one to allow adding a deal), skipping Step 1's KYC fields.
    // The nav's own label is the short "Branches & Access" (see `vendor-pipeline.tsx`'s `STEPS`
    // array) — distinct from the longer `<h2>` section heading rendered once that step is active.
    await page.getByRole('navigation', { name: 'Onboarding steps' }).getByRole('button', { name: 'Branches & Access' }).click();
    await expect(page.getByRole('heading', { name: 'Step 2: Branches, Modules & Category Access' })).toBeVisible();
    await page.getByRole('button', { name: 'Add branch' }).click();
    await page.getByLabel('Branch Name').fill('Serenity Spa - Andheri');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Serenity Spa - Andheri')).toBeVisible();

    // ── Step 3 — Deals: drill Category -> Subcategory -> Type ───────────────────────────
    await page.getByRole('navigation', { name: 'Onboarding steps' }).getByRole('button', { name: 'Deals' }).click();
    await expect(page.getByRole('heading', { name: 'Step 3: Deals' })).toBeVisible();
    await page.getByRole('button', { name: 'Add deal' }).click();
    await selectMaterialOption(page, 'Category', 'Massage');
    await selectMaterialOption(page, 'Subcategory (optional)', 'Body Massage');
    await selectMaterialOption(page, 'Type (optional)', 'Swedish Massage');
    await page.getByLabel('Title').fill('Signature Swedish Massage');
    await page.getByLabel('Slug').fill('signature-swedish-massage');
    await page.getByText('Packages', { exact: true }).click();
    await page.getByRole('button', { name: 'Add package' }).click();
    await page.getByLabel('Duration (minutes)').fill('60');
    await page.getByLabel('Selling price').fill('1499');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Signature Swedish Massage')).toBeVisible();

    expect(backend.deals.length).toBe(1);
    expect(backend.deals[0].categoryId).toBe(TOP_MASSAGE.id);
    // The Type pick overwrote subcategoryId with the deeper (Type-tier) id, not the Subcategory's.
    expect(backend.deals[0].subcategoryId).toBe(TYPE_SWEDISH.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────

test.describe('Public storefront — /category/:slug still renders against the new 8-category taxonomy', () => {
  test('renders a top-level category from the post-reset taxonomy with its Subcategory tabs', async ({ page }) => {
    const massageWithChildren = {
      id: TOP_MASSAGE.id,
      name: 'Massage',
      slug: 'massage',
      description: null,
      children: [{ id: SUB_BODY_MASSAGE.id, name: 'Body Massage', slug: 'body-massage', description: null }],
    };
    // The full post-reset top-level set (8 categories) — only `massage` is opened in this test,
    // but listing all 8 here documents the shape `/categories` (the "browse all" index) now
    // returns post-reset.
    const allTopLevel = [
      'Massage', 'Spa & Retreats', 'Skin & Beauty', 'Hair & Nails', 'Health & Wellness', 'Therapy', 'Product', 'Home Services',
    ].map((name, i) => ({
      id: `top-${i}`,
      name,
      slug: name.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-'),
      description: null,
      children: [] as unknown[],
    }));

    await page.route(`${API_BASE}/catalog/categories`, (route: Route) => route.fulfill({ json: envelope(allTopLevel) }));
    await page.route(`${API_BASE}/catalog/categories/massage`, (route: Route) => route.fulfill({ json: envelope(massageWithChildren) }));
    await page.route(`${API_BASE}/catalog/deals**`, (route: Route) => route.fulfill({ json: envelope([]) }));

    await page.goto('/categories');
    await expect(page.getByRole('heading', { name: 'Massage' })).toBeVisible();
    // "Home Services" also appears in the nav drawer + footer "Discover" links + site banner —
    // scope to the category grid's own card heading (an <h3>, per shared-ui's `sky-category-card`
    // semantic markup) to unambiguously confirm the newly-added 8th top-level category rendered
    // as a real category card, not just a nav link.
    await expect(page.getByRole('heading', { name: 'Home Services', level: 3 })).toBeVisible();

    await page.goto('/category/massage');
    await expect(page.getByRole('heading', { name: 'Massage' })).toBeVisible();
    // The subcategory `Tabs`/`PrimaryTab` row doesn't expose an interactive role in the real
    // accessibility tree (unlike the "All / Services / Products" `FilterChip` row below it, which
    // does) — assert on its own container's text instead of a role query.
    await expect(page.locator('.category-page__tabs-wrap')).toContainText('Body Massage');
  });
});
