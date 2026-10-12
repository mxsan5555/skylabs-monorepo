# Vendor Branches CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an admin a real, popup-free way to add, edit and deactivate a vendor's branches from `/account/vendors/:vendorId/branches`, replacing the old dialog-based `VendorBranches` on that route.

**Architecture:** A card-grid list page (`BranchesListPage`) plugged into `VendorDetailPage`'s existing `section="branches"` slot, plus a standalone full-page add/edit form (`BranchFormPage`) at two new routes. Both reuse the existing `createBranch`/`updateBranch`/`setBranchStatus`/`listBranches`/`getBranchCategoryAccess`/`setBranchCategoryAccess` API functions (`api/rbac/vendors.ts`) — no backend changes. Form helpers (`OpeningHoursEditor`, pincode/map-URL validators) are exported from the existing `vendor-branches.tsx` instead of being rewritten.

**Tech Stack:** React 19, react-router-dom, `@skylabs-monorepo/shared-ui/react` (M3 web-component wrappers), Vitest + Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-09-28-vendor-branch-management-design.md`

---

## Two disclosed adjustments from the spec (read before starting)

The spec assumed each branch card shows both a Deals count and a Therapists count. Two real constraints change that for *this* plan only:

1. **Therapists count is dropped from the card for now.** `Branch._count` only ever includes `{ deals: number }` (verified in `api/rbac/vendors.ts`) — there is no per-branch therapist count without either a new backend field or fetching *every* therapist for the vendor just to compute one number, which is scope creep for a Branches-only plan. Plan 3 (Therapists) decides how to add it back.
2. **The Deals count is plain text, not a link, in this plan.** `/branches/:branchId/deals` doesn't exist until Plan 2 ships. Plan 2's own task list turns this same text into a real link once that route exists — see the `// PLAN 2:` comment left in the code below.

Both are called out explicitly in code comments so nothing is silently missing.

---

## Task 1: Export the branch-form helpers `BranchFormPage` needs

**Files:**
- Modify: `apps/msd/src/app/pages/account/vendors/vendor-branches.tsx`

Nothing here changes behavior — it only adds the `export` keyword to four things `BranchDialog` already defines privately, so the new page can reuse them instead of duplicating ~80 lines of validated logic.

- [ ] **Step 1: Add `export` to the four helpers**

In `apps/msd/src/app/pages/account/vendors/vendor-branches.tsx`, change these four declarations (keep everything else about them identical):

```tsx
// was: function validateMapLocationUrl(value: string): string | null {
export function validateMapLocationUrl(value: string): string | null {
```

```tsx
// was: function validateBranchPincode(value: string): string | null {
export function validateBranchPincode(value: string): string | null {
```

```tsx
// was: function normalizeOpeningHours(raw: unknown): OpeningHours {
export function normalizeOpeningHours(raw: unknown): OpeningHours {
```

```tsx
// was: function OpeningHoursEditor({ value, onChange }: { value: OpeningHours; onChange: (next: OpeningHours) => void }) {
export function OpeningHoursEditor({ value, onChange }: { value: OpeningHours; onChange: (next: OpeningHours) => void }) {
```

- [ ] **Step 2: Verify nothing else broke**

Run: `npx tsc --noEmit -p apps/msd/tsconfig.app.json 2>&1 | grep vendor-branches`
Expected: no output (clean).

Run: `cd apps/msd && npx vitest run vendor-branches`
Expected: all existing tests in that file still pass (this step only adds `export`, changes no logic).

- [ ] **Step 3: Commit**

```bash
git add apps/msd/src/app/pages/account/vendors/vendor-branches.tsx
git commit -m "refactor(msd): Export branch form helpers for reuse"
```

---

## Task 2: `branches-list-page.tsx` — the card grid

**Files:**
- Create: `apps/msd/src/app/pages/account/vendors/branches-list-page.tsx`
- Create: `apps/msd/src/app/pages/account/vendors/branches-list-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/msd/src/app/pages/account/vendors/branches-list-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Branch } from '../../../../api/rbac/vendors';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listBranchesMock = vi.fn();
const setBranchStatusMock = vi.fn();
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    setBranchStatus: (...args: unknown[]) => setBranchStatusMock(...args),
  };
});

import { BranchesListPage } from './branches-list-page';

const BRANCH_A: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: null,
  city: 'Mumbai',
  state: 'Maharashtra',
  country: null,
  pincode: null,
  latitude: null,
  longitude: null,
  mapLocationUrl: null,
  phone: null,
  email: null,
  openingHours: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { deals: 3 },
  categoryTypes: [],
};

const BRANCH_B: Branch = { ...BRANCH_A, id: 'b2', name: 'Colaba Branch', city: 'Mumbai', isActive: false, _count: { deals: 0 } };

function attr(el: Element, name: string): string | null {
  const value = (el as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : el.getAttribute(name);
}

function renderPage(canEdit = true) {
  listBranchesMock.mockResolvedValue({ data: [BRANCH_A, BRANCH_B] });
  return render(
    <MemoryRouter>
      <BranchesListPage token="tok" vendorId="v1" canEdit={canEdit} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BranchesListPage', () => {
  it('loads and shows one card per branch, with its location and deal count', async () => {
    renderPage();
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalledWith('tok', 'v1'));
    // sky-feature-card is a custom element with no shadow-DOM rendering under jsdom (this repo's
    // documented @lit/react gap) — assert on the attributes React sets, not on rendered text/role.
    await waitFor(() => expect(document.querySelectorAll('sky-feature-card')).toHaveLength(2));
    const cards = Array.from(document.querySelectorAll('sky-feature-card'));
    expect(cards.map((c) => [attr(c, 'headline'), attr(c, 'text')])).toEqual([
      ['Lower Parel Branch', 'Maharashtra, Mumbai · Active · 3 deals'],
      ['Colaba Branch', 'Maharashtra, Mumbai · Inactive · No deals yet'],
    ]);
  });

  it('shows a heading with the branch count', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Branches' })).toBeTruthy();
    expect(await screen.findByText('2 branches')).toBeTruthy();
  });

  it('shows "+ Add branch" only when canEdit is true', async () => {
    renderPage(true);
    expect(await screen.findByText('+ Add branch')).toBeTruthy();
  });

  it('hides "+ Add branch" when canEdit is false', async () => {
    renderPage(false);
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalled());
    expect(screen.queryByText('+ Add branch')).toBeNull();
  });

  it('Edit navigates to that branch\'s edit page', async () => {
    renderPage();
    await screen.findByText('Lower Parel Branch');
    const editButtons = document.querySelectorAll('md-outlined-button');
    const edit = Array.from(editButtons).find((b) => b.textContent?.trim() === 'Edit');
    if (!edit) throw new Error('Edit button not found');
    fireEvent.click(edit);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/branches/b1');
  });

  it('Deactivate asks for confirmation, then calls setBranchStatus(false) and reloads the list', async () => {
    setBranchStatusMock.mockResolvedValue({ data: { ...BRANCH_A, isActive: false } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Lower Parel Branch');
    const buttons = document.querySelectorAll('md-outlined-button');
    const deactivate = Array.from(buttons).find((b) => b.textContent?.trim() === 'Deactivate');
    if (!deactivate) throw new Error('Deactivate button not found');
    fireEvent.click(deactivate);
    await waitFor(() => expect(setBranchStatusMock).toHaveBeenCalledWith('tok', 'v1', 'b1', false));
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalledTimes(2));
  });

  it('an inactive branch offers Activate instead of Deactivate', async () => {
    renderPage();
    await screen.findByText('Colaba Branch');
    const cards = Array.from(document.querySelectorAll('sky-feature-card'));
    const colaba = cards.find((c) => attr(c, 'headline') === 'Colaba Branch');
    const label = colaba?.querySelector('md-outlined-button:last-of-type')?.textContent?.trim();
    expect(label).toBe('Activate');
  });

  it('shows an empty state with no branches yet', async () => {
    listBranchesMock.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter>
        <BranchesListPage token="tok" vendorId="v1" canEdit />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No branches yet/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/msd && npx vitest run branches-list-page`
Expected: FAIL — `Cannot find module './branches-list-page'` (the component doesn't exist yet).

- [ ] **Step 3: Write the component**

Create `apps/msd/src/app/pages/account/vendors/branches-list-page.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { listBranches, setBranchStatus, type Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { CardGrid } from '../../../components/card-grid/card-grid';
import { useConfirmDialog } from '../../../components/confirm-dialog';

interface BranchesListPageProps {
  token: string | null;
  vendorId: string;
  /** Gates "+ Add branch" and each card's Edit/Deactivate actions — matches `vendors:edit`,
   *  passed down from `VendorDetailPage` the same way it already was to the old `VendorBranches`. */
  canEdit: boolean;
}

/** One branch's location + status + deal count, one line (no separate fields to scan). */
function branchSummary(branch: Branch): string {
  const location = branch.state ? `${branch.state}${branch.city ? `, ${branch.city}` : ''}` : 'No location set';
  const status = branch.isActive ? 'Active' : 'Inactive';
  const deals = branch._count?.deals ?? 0;
  // PLAN 2: once /branches/:branchId/deals exists, this becomes a link instead of plain text,
  // and a Therapists count is added back once Plan 3 decides how to source it without an
  // all-vendor therapist fetch (see this plan's "Two disclosed adjustments" note).
  const dealsText = deals > 0 ? `${deals} deal${deals === 1 ? '' : 's'}` : 'No deals yet';
  return `${location} · ${status} · ${dealsText}`;
}

/** Branches — card grid. Plugged into `VendorDetailPage`'s `section="branches"`.
 *  Add/Edit are full pages (`/branches/new`, `/branches/:branchId`), never a popup; branches
 *  have no hard delete (they cascade to deals/therapists/orders), so the only destructive action
 *  is Deactivate, confirmed the same way as every other destructive action in this console. */
export function BranchesListPage({ token, vendorId, canEdit }: BranchesListPageProps) {
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listBranches(token, vendorId);
      setBranches(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  }, [token, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (branch: Branch) => {
    if (branch.isActive && !(await confirm(`Deactivate "${branch.name}"? It stops taking new bookings until reactivated.`))) return;
    try {
      await setBranchStatus(token, vendorId, branch.id, !branch.isActive);
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update this branch.');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="section-title">Branches</h2>
          <p className="field-hint">{loading ? 'Loading…' : `${branches.length} branch${branches.length === 1 ? '' : 'es'}`}</p>
        </div>
        {canEdit && (
          <div className="page-head__actions">
            <FilledButton onClick={() => navigate(`/account/vendors/${vendorId}/branches/new`)}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              + Add branch
            </FilledButton>
          </div>
        )}
      </div>

      {error && <p className="error-state" role="alert">{error}</p>}

      {!loading && branches.length === 0 ? (
        <p className="empty-state">No branches yet. Add one to unlock deals, therapists and products.</p>
      ) : (
        <CardGrid layout="compact">
          {branches.map((branch) => (
            <sky-feature-card key={branch.id} color="none" variant="outlined" headline={branch.name} text={branchSummary(branch)}>
              {canEdit && (
                <>
                  <OutlinedButton slot="actions" onClick={() => navigate(`/account/vendors/${vendorId}/branches/${branch.id}`)}>
                    Edit
                  </OutlinedButton>
                  <OutlinedButton slot="actions" onClick={() => toggleStatus(branch)}>
                    {branch.isActive ? 'Deactivate' : 'Activate'}
                  </OutlinedButton>
                </>
              )}
            </sky-feature-card>
          ))}
        </CardGrid>
      )}
      {ConfirmDialog}
    </div>
  );
}

export default BranchesListPage;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/msd && npx vitest run branches-list-page`
Expected: PASS — 7 tests.

If the "Edit navigates" or "Deactivate" tests fail because `md-outlined-button` isn't found: check that `OutlinedButton`'s slotted children render as light DOM (they do, per this repo's `@lit/react` convention already used identically in `vendor-detail-page.tsx`'s `SetupCard`) — no shadow-DOM query needed.

- [ ] **Step 5: Lint and typecheck**

Run: `cd ../.. && npx eslint apps/msd/src/app/pages/account/vendors/branches-list-page.tsx apps/msd/src/app/pages/account/vendors/branches-list-page.test.tsx`
Expected: no output.

Run: `npx tsc --noEmit -p apps/msd/tsconfig.app.json 2>&1 | grep branches-list-page`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/msd/src/app/pages/account/vendors/branches-list-page.tsx apps/msd/src/app/pages/account/vendors/branches-list-page.test.tsx
git commit -m "feat(msd): Add BranchesListPage card grid"
```

---

## Task 3: Wire `BranchesListPage` into `VendorDetailPage`

**Files:**
- Modify: `apps/msd/src/app/pages/account/vendors/vendor-detail-page.tsx`
- Modify: `apps/msd/src/app/pages/account/vendors/vendor-detail-page.test.tsx`

- [ ] **Step 1: Update the test's mock and label assertions first**

The section is no longer "Branches & Deals" — Deals moved to its own page-per-branch (Plan 2), so this section is now Branches alone. Two changes in `vendor-detail-page.test.tsx`:

Change the mock:

```tsx
vi.mock('./vendor-branches', () => ({ VendorBranches: () => <p>branches-tab</p> }));
```

to:

```tsx
vi.mock('./branches-list-page', () => ({ BranchesListPage: () => <p>branches-tab</p> }));
```

And update the two assertions that spell out the old label (search the file for `Branches & Deals` — there are exactly two: the locked-section-redirect test and the opens-unlocked-section test):

```tsx
expect(await screen.findByText('Branches & Deals is locked. Finish the profile first.')).toBeTruthy();
```
→
```tsx
expect(await screen.findByText('Branches is locked. Finish the profile first.')).toBeTruthy();
```

```tsx
'Members > All Member(/account/vendors) > Vitality Wellness & Beauty(/account/vendors/v1) > Branches & Deals',
```
→
```tsx
'Members > All Member(/account/vendors) > Vitality Wellness & Beauty(/account/vendors/v1) > Branches',
```

Every other existing assertion that checks for the placeholder text `'branches-tab'` stays exactly as written — only the mocked module path and the two label strings above change.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/msd && npx vitest run vendor-detail-page`
Expected: FAIL on every test that reaches the `branches` section — `VendorBranches` is still imported from `./vendor-branches` in the real component, so the new mock target is never hit.

- [ ] **Step 3: Rename the section label, swap the import and the render call**

In `vendor-detail-page.tsx`, change the `SECTIONS` entry:

```tsx
// was: { key: 'branches', label: 'Branches & Deals' },
{ key: 'branches', label: 'Branches' },
```

Change the import:

```tsx
// was: import { VendorBranches } from './vendor-branches';
import { BranchesListPage } from './branches-list-page';
```

And change the `section === 'branches'` block from:

```tsx
{section === 'branches' && (
  <div className="admin-tab-panel" aria-label="Branches and Deals">
    <VendorBranches
      token={token}
      vendorId={vendor.id}
      isSelf={false}
      canEdit={canEditAny}
      canApproveDeal={canApprove}
      canDeleteDeal={canDelete}
      categories={categories}
      onVendorRefresh={() => load(true)}
    />
  </div>
)}
```

to:

```tsx
{section === 'branches' && (
  <div className="admin-tab-panel" aria-label="Branches">
    <BranchesListPage token={token} vendorId={vendor.id} canEdit={canEditAny} />
  </div>
)}
```

`categories`, `canApprove`, `canDeleteDeal` and `onVendorRefresh` were only needed by the Deals half of the old combined component — Deals lives in Plan 2 now, so drop them from this call. Leave the `categories` state/fetch effect in `VendorDetailPage` alone for now; Plan 2 reuses it for the branch-scoped Deal form and will remove it if it turns out unused after that lands (do not remove it speculatively here — that would be guessing ahead of a plan that hasn't been written yet).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/msd && npx vitest run vendor-detail-page`
Expected: PASS — all 21 tests.

- [ ] **Step 5: Lint and typecheck**

Run: `cd ../.. && npx eslint apps/msd/src/app/pages/account/vendors/vendor-detail-page.tsx apps/msd/src/app/pages/account/vendors/vendor-detail-page.test.tsx`
Expected: no output.

Run: `npx tsc --noEmit -p apps/msd/tsconfig.app.json 2>&1 | grep vendor-detail-page`
Expected: no output. (An unused `canApprove`/`canDeleteDeal`/`categories` warning here would mean they're used nowhere else in the file — check before assuming; `canApprove` and `canDeleteDeal` are both still used by the Actions menu and the profile-wizard call, `categories` is still fetched but now only consumed by the removed call — if `tsc`/eslint flags `categories`/`setCategories`/the `listCategories` effect as unused, leave them in place with a one-line comment `// kept for Plan 2's branch-scoped Deal form` rather than deleting them, since ESLint's `no-unused-vars` only fires on truly-dead bindings and Plan 2 needs this within days.)

- [ ] **Step 6: Commit**

```bash
git add apps/msd/src/app/pages/account/vendors/vendor-detail-page.tsx apps/msd/src/app/pages/account/vendors/vendor-detail-page.test.tsx
git commit -m "feat(msd): Wire BranchesListPage into the member page's Branches section"
```

---

## Task 4: `branch-form-page.tsx` — Add/Edit branch

**Files:**
- Create: `apps/msd/src/app/pages/account/vendors/branch-form-page.tsx`
- Create: `apps/msd/src/app/pages/account/vendors/branch-form-page.test.tsx`

Single page, `sky-accordion` sections: **Location** (Branch Name/Address/State/City/PIN/Map Location — everything but State starts disabled), **Opening Hours** (reuses `OpeningHoursEditor` from Task 1), **Category Access** (admin-only; the same checkbox-tree logic `BranchDialog` already has, adapted into this page rather than extracted into a shared component — flagged below as a known follow-up, not a silent duplication).

- [ ] **Step 1: Write the failing test**

Create `apps/msd/src/app/pages/account/vendors/branch-form-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Branch, Category } from '../../../../api/rbac/vendors';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const listBranchesMock = vi.fn();
const createBranchMock = vi.fn();
const updateBranchMock = vi.fn();
const listCategoriesMock = vi.fn();
const getBranchCategoryAccessMock = vi.fn();
const setBranchCategoryAccessMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    createBranch: (...args: unknown[]) => createBranchMock(...args),
    updateBranch: (...args: unknown[]) => updateBranchMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    getBranchCategoryAccess: (...args: unknown[]) => getBranchCategoryAccessMock(...args),
    setBranchCategoryAccess: (...args: unknown[]) => setBranchCategoryAccessMock(...args),
  };
});

import { BranchFormPage } from './branch-form-page';

const EXISTING: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: '123 Main Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: null,
  pincode: '400013',
  latitude: null,
  longitude: null,
  mapLocationUrl: null,
  phone: null,
  email: null,
  openingHours: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { deals: 0 },
  categoryTypes: [],
};

const CATEGORY: Category = { id: 'c1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' };

function renderAt(url: string) {
  listCategoriesMock.mockResolvedValue({ data: [CATEGORY] });
  getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
  listBranchesMock.mockResolvedValue({ data: [EXISTING] });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/account/vendors/:vendorId/branches/new" element={<BranchFormPage token="tok" />} />
        <Route path="/account/vendors/:vendorId/branches/:branchId" element={<BranchFormPage token="tok" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BranchFormPage — Add', () => {
  it('starts with every field but State disabled', async () => {
    renderAt('/account/vendors/v1/branches/new');
    expect(await screen.findByRole('heading', { name: 'Add branch' })).toBeTruthy();
    const name = document.querySelector('md-outlined-text-field[label="Branch Name"]');
    expect(name?.hasAttribute('disabled')).toBe(true);
    const state = document.querySelector('md-outlined-select[label="State"]');
    expect(state?.hasAttribute('disabled')).toBeFalsy();
  });

  it('enables the rest of Location once a state is picked', async () => {
    renderAt('/account/vendors/v1/branches/new');
    await screen.findByRole('heading', { name: 'Add branch' });
    const state = document.querySelector('md-outlined-select[label="State"]') as HTMLElement;
    fireEvent.change(state, { target: { value: 'Maharashtra' } });
    await waitFor(() => {
      const name = document.querySelector('md-outlined-text-field[label="Branch Name"]');
      expect(name?.hasAttribute('disabled')).toBe(false);
    });
  });

  it('creates the branch and redirects to its own edit page', async () => {
    createBranchMock.mockResolvedValue({ data: { ...EXISTING, id: 'new-1' } });
    setBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    renderAt('/account/vendors/v1/branches/new');
    await screen.findByRole('heading', { name: 'Add branch' });
    const state = document.querySelector('md-outlined-select[label="State"]') as HTMLElement;
    fireEvent.change(state, { target: { value: 'Maharashtra' } });
    const name = await waitFor(() => document.querySelector('md-outlined-text-field[label="Branch Name"]') as HTMLElement);
    fireEvent.input(name, { target: { value: 'New Branch' } });
    const save = Array.from(document.querySelectorAll('md-filled-button')).find((b) => b.textContent?.trim() === 'Save');
    if (!save) throw new Error('Save button not found');
    fireEvent.click(save);
    await waitFor(() => expect(createBranchMock).toHaveBeenCalledWith('tok', 'v1', expect.objectContaining({ name: 'New Branch', state: 'Maharashtra' })));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/branches/new-1', { replace: true }));
  });
});

describe('BranchFormPage — Edit', () => {
  it('loads the existing branch and shows every field already enabled', async () => {
    renderAt('/account/vendors/v1/branches/b1');
    expect(await screen.findByRole('heading', { name: 'Edit branch' })).toBeTruthy();
    const name = await waitFor(() => document.querySelector('md-outlined-text-field[label="Branch Name"]'));
    expect(name?.hasAttribute('disabled')).toBe(false);
    expect((name as unknown as { value?: string })?.getAttribute('value')).toBe('Lower Parel Branch');
  });

  it('saves with updateBranch, not createBranch', async () => {
    updateBranchMock.mockResolvedValue({ data: EXISTING });
    setBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    renderAt('/account/vendors/v1/branches/b1');
    await screen.findByRole('heading', { name: 'Edit branch' });
    const save = await waitFor(() => Array.from(document.querySelectorAll('md-filled-button')).find((b) => b.textContent?.trim() === 'Save'));
    if (!save) throw new Error('Save button not found');
    fireEvent.click(save);
    await waitFor(() => expect(updateBranchMock).toHaveBeenCalledWith('tok', 'v1', 'b1', expect.objectContaining({ name: 'Lower Parel Branch' })));
    expect(createBranchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/msd && npx vitest run branch-form-page`
Expected: FAIL — `Cannot find module './branch-form-page'`.

- [ ] **Step 3: Write the component**

Create `apps/msd/src/app/pages/account/vendors/branch-form-page.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FilledButton, OutlinedTextField, OutlinedSelect, SelectOption } from '@skylabs-monorepo/shared-ui/react';
import {
  createBranch,
  getBranchCategoryAccess,
  listBranches,
  listCategories,
  setBranchCategoryAccess,
  updateBranch,
  type Branch,
  type BranchInput,
  type Category,
  type OpeningHours,
} from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useSetBreadcrumbs } from '../../../admin/breadcrumb-context';
import { STATES, citiesForState } from '../../../../data/india-locations';
import { normalizeOpeningHours, OpeningHoursEditor, validateBranchPincode, validateMapLocationUrl } from './vendor-branches';

interface BranchFormPageProps {
  token: string | null;
}

/** Add/Edit branch — `/account/vendors/:vendorId/branches/new` and `.../branches/:branchId`.
 *  One page, `sky-accordion` sections: Location (State first — every other field starts
 *  disabled until a state is picked), Opening Hours, Category Access (admin-only).
 *
 *  The Category Access checkbox tree below is adapted from `BranchDialog` in `vendor-branches.tsx`
 *  rather than extracted into a shared component — flagged as a known dedup opportunity, not a
 *  silent copy, same tradeoff already accepted for self-service in the design spec (see that
 *  file's "Out of scope" section). */
export function BranchFormPage({ token }: BranchFormPageProps) {
  const { vendorId, branchId } = useParams<{ vendorId: string; branchId?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(branchId);

  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState({ name: '', address: '', city: '', state: '', pincode: '', mapLocationUrl: '' });
  const [openingHours, setOpeningHours] = useState<OpeningHours>({});
  const [errors, setErrors] = useState<Partial<Record<'name' | 'pincode' | 'mapLocationUrl', string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryMap, setCategoryMap] = useState<Map<string, Set<string>>>(new Map());
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    if (!isEdit || !vendorId || !branchId) return;
    setLoading(true);
    listBranches(token, vendorId)
      .then(({ data }) => {
        const found = data.find((b) => b.id === branchId);
        if (!found) {
          setLoadError('Branch not found.');
          return;
        }
        setBranch(found);
        setForm({
          name: found.name,
          address: found.address ?? '',
          city: found.city ?? '',
          state: found.state ?? '',
          pincode: found.pincode ?? '',
          mapLocationUrl: found.mapLocationUrl ?? '',
        });
        setOpeningHours(normalizeOpeningHours(found.openingHours));
      })
      .catch((err) => setLoadError(err instanceof ApiRequestError ? err.message : 'Could not load this branch.'))
      .finally(() => setLoading(false));
  }, [token, vendorId, branchId, isEdit]);

  useEffect(() => {
    if (!vendorId) return;
    setCategoriesLoading(true);
    Promise.all([
      listCategories(token, { type: 'SERVICE' }),
      listCategories(token, { type: 'THERAPY' }),
      isEdit && branchId ? getBranchCategoryAccess(token, vendorId, branchId).then((r) => r.data) : Promise.resolve(null),
    ])
      .then(([svc, thr, access]) => {
        setCategories([...svc.data, ...thr.data]);
        if (access) {
          const next = new Map<string, Set<string>>();
          access.forEach((row) => next.set(row.categoryId, new Set(row.subcategories.map((s) => s.subcategoryId))));
          setCategoryMap(next);
        }
      })
      .finally(() => setCategoriesLoading(false));
  }, [token, vendorId, branchId, isEdit]);

  const name = branch?.name || (isEdit ? 'Branch' : 'New branch');
  useSetBreadcrumbs([
    { label: 'Members' },
    { label: 'All Member', to: '/account/vendors' },
    { label: 'Member', to: `/account/vendors/${vendorId}` },
    { label: 'Branches', to: `/account/vendors/${vendorId}/branches` },
    { label: isEdit ? name : 'Add branch' },
  ]);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value, ...(key === 'state' ? { city: '' } : {}) }));
    setErrors((e) => (e[key as keyof typeof errors] ? { ...e, [key]: undefined } : e));
  };

  const locationUnlocked = Boolean(form.state);
  const topLevelCategories = categories.filter((c) => !c.parentId);

  const toggleCategory = (categoryId: string) =>
    setCategoryMap((prev) => {
      const next = new Map(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.set(categoryId, new Set());
      return next;
    });

  const toggleSubcategory = (categoryId: string, subcategoryId: string) =>
    setCategoryMap((prev) => {
      const next = new Map(prev);
      const subs = new Set(next.get(categoryId) ?? new Set<string>());
      if (subs.has(subcategoryId)) subs.delete(subcategoryId);
      else subs.add(subcategoryId);
      next.set(categoryId, subs);
      return next;
    });

  const save = useCallback(async () => {
    if (!vendorId) return;
    const nextErrors: typeof errors = {
      name: form.name.trim() ? undefined : 'Branch name is required.',
      pincode: validateBranchPincode(form.pincode) ?? undefined,
      mapLocationUrl: validateMapLocationUrl(form.mapLocationUrl) ?? undefined,
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      setSaveError('Fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const input: BranchInput = {
        name: form.name,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        pincode: form.pincode || undefined,
        mapLocationUrl: form.mapLocationUrl.trim() || undefined,
        openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
      };
      const saved = isEdit && branchId
        ? (await updateBranch(token, vendorId, branchId, input)).data
        : (await createBranch(token, vendorId, input)).data;

      const mappings = [...categoryMap.entries()].map(([categoryId, subcategoryIds]) => ({ categoryId, subcategoryIds: [...subcategoryIds] }));
      await setBranchCategoryAccess(token, vendorId, saved.id, { mappings });

      navigate(`/account/vendors/${vendorId}/branches/${saved.id}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof ApiRequestError ? err.message : 'Could not save this branch.');
    } finally {
      setSaving(false);
    }
  }, [vendorId, branchId, isEdit, form, openingHours, categoryMap, token, navigate]);

  if (loading) return <p className="loading-state">Loading branch…</p>;
  if (loadError) return <p className="error-state" role="alert">{loadError}</p>;

  return (
    <div className="admin-page">
      <title>{`${isEdit ? 'Edit' : 'Add'} branch · MSD`}</title>
      <header className="page-head">
        <h1>{isEdit ? 'Edit branch' : 'Add branch'}</h1>
      </header>

      {saveError && <p className="error-state" role="alert">{saveError}</p>}

      <sky-accordion>
        <sky-accordion-item header="Location" open>
          <div className="form-grid">
            <OutlinedSelect label="State" value={form.state} onChange={(e: Event) => set('state', (e.target as HTMLSelectElement).value)}>
              <SelectOption value="">
                <div slot="headline">Select a state</div>
              </SelectOption>
              {STATES.map((state) => (
                <SelectOption key={state} value={state}>
                  <div slot="headline">{state}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
            {!locationUnlocked && <p className="field-hint">Pick a state to fill in the rest.</p>}

            <OutlinedTextField
              label="Branch Name"
              required
              disabled={!locationUnlocked}
              value={form.name}
              onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)}
              error={Boolean(errors.name)}
            />
            {errors.name && <p className="error-state" role="alert">{errors.name}</p>}

            <OutlinedTextField
              label="Address"
              disabled={!locationUnlocked}
              value={form.address}
              onInput={(e: Event) => set('address', (e.target as HTMLInputElement).value)}
            />

            <OutlinedSelect
              label="City"
              value={form.city}
              disabled={!locationUnlocked}
              onChange={(e: Event) => set('city', (e.target as HTMLSelectElement).value)}
            >
              <SelectOption value="">
                <div slot="headline">Select a city</div>
              </SelectOption>
              {citiesForState(form.state).map((city) => (
                <SelectOption key={city} value={city}>
                  <div slot="headline">{city}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>

            <OutlinedTextField
              label="PIN Code"
              disabled={!locationUnlocked}
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onInput={(e: Event) => set('pincode', (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))}
              error={Boolean(errors.pincode)}
            />
            {errors.pincode && <p className="error-state" role="alert">{errors.pincode}</p>}

            <OutlinedTextField
              label="Map Location"
              type="url"
              disabled={!locationUnlocked}
              placeholder="Paste Google Maps location link"
              value={form.mapLocationUrl}
              onInput={(e: Event) => set('mapLocationUrl', (e.target as HTMLInputElement).value)}
              error={Boolean(errors.mapLocationUrl)}
            />
            {errors.mapLocationUrl && <p className="error-state" role="alert">{errors.mapLocationUrl}</p>}
          </div>
        </sky-accordion-item>

        <sky-accordion-item header="Opening Hours" disabled={!locationUnlocked}>
          <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
        </sky-accordion-item>

        <sky-accordion-item header="Category Access" disabled={!locationUnlocked}>
          {categoriesLoading ? (
            <p className="loading-state">Loading categories…</p>
          ) : topLevelCategories.length === 0 ? (
            <p className="empty-state">No active Service or Therapy categories exist yet.</p>
          ) : (
            <div className="category-grant-grid">
              {topLevelCategories.map((category) => {
                const subcategoryOptions = categories.filter((c) => c.parentId === category.id);
                const checked = categoryMap.has(category.id);
                return (
                  <div className="category-grant-grid__group" key={category.id}>
                    <label className="category-grant-grid__option">
                      <input type="checkbox" checked={checked} onChange={() => toggleCategory(category.id)} />
                      {category.name}
                    </label>
                    {checked && subcategoryOptions.length > 0 && (
                      <div className="category-grant-grid__subgroup">
                        {subcategoryOptions.map((sub) => (
                          <label key={sub.id} className="category-grant-grid__option category-grant-grid__option--indented">
                            <input
                              type="checkbox"
                              checked={categoryMap.get(category.id)?.has(sub.id) ?? false}
                              onChange={() => toggleSubcategory(category.id, sub.id)}
                            />
                            {sub.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </sky-accordion-item>
      </sky-accordion>

      <div className="form-actions">
        <FilledButton disabled={saving || !locationUnlocked} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </FilledButton>
      </div>
    </div>
  );
}

export default BranchFormPage;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/msd && npx vitest run branch-form-page`
Expected: PASS — 6 tests.

- [ ] **Step 5: Lint and typecheck**

Run: `cd ../.. && npx eslint apps/msd/src/app/pages/account/vendors/branch-form-page.tsx apps/msd/src/app/pages/account/vendors/branch-form-page.test.tsx`
Expected: no output.

Run: `npx tsc --noEmit -p apps/msd/tsconfig.app.json 2>&1 | grep branch-form-page`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/msd/src/app/pages/account/vendors/branch-form-page.tsx apps/msd/src/app/pages/account/vendors/branch-form-page.test.tsx
git commit -m "feat(msd): Add BranchFormPage (add/edit branch, state-gated)"
```

---

## Task 5: Wire the two new routes into `routes.tsx`

**Files:**
- Modify: `apps/msd/src/app/routes.tsx`

- [ ] **Step 1: Add the import**

Next to the existing `import { VendorDetailPage } from './pages/account/vendors/vendor-detail-page';`, add:

```tsx
import { BranchFormPage } from './pages/account/vendors/branch-form-page';
```

- [ ] **Step 2: Add the two routes**

Directly after the existing `/account/vendors/:vendorId/:section` route block, add:

```tsx
{/* Branch add/edit — real pages, never a popup (see the branch-management design spec).
  The static `new` segment wins over the dynamic `:branchId` below it. */}
<Route
  path="/account/vendors/:vendorId/branches/new"
  element={
    <VendorsRouteGuard>
      <BranchFormPageRoute />
    </VendorsRouteGuard>
  }
/>
<Route
  path="/account/vendors/:vendorId/branches/:branchId"
  element={
    <VendorsRouteGuard>
      <BranchFormPageRoute />
    </VendorsRouteGuard>
  }
/>
```

`BranchFormPage` needs `token` from `useAuth()`, which route elements don't get for free — add this tiny wrapper right above the `AppRoutes` function (or next to `VendorsRouteGuard`, same file):

```tsx
function BranchFormPageRoute() {
  const { token } = useAuth();
  return <BranchFormPage token={token} />;
}
```

(`useAuth` is already imported in this file — `VendorsRouteGuard` right above uses it.)

- [ ] **Step 3: Verify the routes resolve**

Run: `npx tsc --noEmit -p apps/msd/tsconfig.app.json 2>&1 | grep routes.tsx`
Expected: no output.

Run: `cd apps/msd && npx vitest run vendor-pipeline vendor-detail-page` (both already exercise `routes.tsx`-adjacent navigation and must still pass)
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `cd .. && npx eslint apps/msd/src/app/routes.tsx`
Expected: no new errors introduced by this change (this file has one pre-existing unrelated warning at line 95 — `react/jsx-no-useless-fragment` — confirmed pre-existing in an earlier round of this same session; do not attempt to fix it as part of this task).

- [ ] **Step 5: Commit**

```bash
git add apps/msd/src/app/routes.tsx
git commit -m "feat(msd): Route /branches/new and /branches/:branchId to BranchFormPage"
```

---

## Task 6: End-to-end verification

- [ ] **Step 1: Run the full vendors-folder suite**

Run: `cd apps/msd && npx vitest run vendors/ card-grid`
Expected: PASS, no failures introduced (baseline flaky tests outside this folder — `india-locations`, `widget-registry`, `media-uploader`, `site-footer`, `become-vendor`, `contact-us`, `app.spec`, `search`, `entry-server` — are pre-existing and unrelated, per this session's own prior verification; do not chase them here).

- [ ] **Step 2: Full msd lint**

Run: `cd .. && npx nx run msd:lint`
Expected: no new errors beyond the pre-existing baseline (43 errors / 87 warnings in files this plan never touches, already confirmed pre-existing earlier this session).

- [ ] **Step 3: Manual smoke test**

With `npx nx serve msd` running, sign in as an admin, open any member's page, click into **Branches**:
1. Confirm "+ Add branch" is visible and the list matches what `listBranches` returns.
2. Click "+ Add branch" — confirm every field except State is disabled, and picking a State enables the rest.
3. Fill in a name, save — confirm it redirects to that branch's own edit page (not back to the list) and the branch now appears in the list.
4. Click **Edit** on an existing branch — confirm its fields are pre-filled and already enabled.
5. Click **Deactivate** — confirm a confirmation prompt appears, and after confirming the card now offers **Activate** instead.

- [ ] **Step 4: Update `TASK.md`**

Add a line under the "msd admin — member (vendor) console redesign" section (already present from the earlier round of this session) marking Branches done and noting Deals/Therapists are their own follow-up plans:

```markdown
- [x] 3a. Branches list + add/edit (`branches-list-page.tsx`, `branch-form-page.tsx`) — state-gated form, deactivate not delete — 2026-09-28
- [ ] 3b. Deals inside a branch (own plan, next)
- [ ] 3c. Therapists inside a branch (own plan, after 3b) — also drops the Overview's standalone Therapists tab (see design spec)
```

```bash
git add TASK.md
git commit -m "docs(repo): Mark branches CRUD done in the member console plan"
```
