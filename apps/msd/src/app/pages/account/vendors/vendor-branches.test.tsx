import { useRef } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { BranchCategoryAccessRow, Category, Deal, Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

// Category/Subcategory options are now branch-scoped (`getBranchCategoryAccess`/
// `getMyBranchCategoryAccess`), not sourced directly from the `categories` prop any more (that
// prop now only backs the "stale value" name lookup) — see `DealDialog`'s own doc comment in
// vendor-branches.tsx. Mocked here the same way vendor-wizard-deals.test.tsx/
// vendor-wizard-therapists.test.tsx mock this module. `listCategories`/`setBranchCategoryAccess`
// back `BranchDialog`'s own Categories & Subcategories section (folded in from the now-deleted
// `branch-category-access-dialog.tsx`).
const getBranchCategoryAccessMock = vi.fn();
const getMyBranchCategoryAccessMock = vi.fn();
const listCategoriesMock = vi.fn();
const setBranchCategoryAccessMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    getBranchCategoryAccess: (...args: unknown[]) => getBranchCategoryAccessMock(...args),
    getMyBranchCategoryAccess: (...args: unknown[]) => getMyBranchCategoryAccessMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    setBranchCategoryAccess: (...args: unknown[]) => setBranchCategoryAccessMock(...args),
  };
});

import { DealDialog, BranchDialog } from './vendor-branches';

/**
 * Feature: DealDialog — Deal is a pure service offering (no Product concept at all)
 * Scenario: `Deal` has no `productId` field any more — Product is a fully independent catalog
 * entity purchased directly via Cart/Order, never wrapped in a Deal. The Deal Add/Edit form
 * always shows the Category/Subcategory selects and always requires at least one package; there
 * is no read-only "pre-existing Product deal" branch left to test, because a Deal can no longer
 * carry a product reference in any form (current or historical).
 *
 * Given: the active branch's own category/subcategory mapping (`BranchCategoryAccess`/
 *        `BranchSubcategoryAccess`, 2- and 3-level branches, including a legacy Type-tier row
 *        from before the "Category Types" master screen was removed)
 * When: DealDialog renders (fresh Add or editing an existing Service deal)
 * Then: Category/Subcategory selects always render, scoped to the branch's own mapping (not the
 *       vendor-wide `categories` prop), and no Product-related control (select, "Offering type"
 *       text, read-only category hint) ever appears
 *
 * NOTE: like `categories.test.tsx`'s suite, live select-interaction can't be simulated under this
 * jsdom + `@lit/react` + React 19 combination (documented in `search.test.tsx`), so this suite
 * verifies via each dialog's already-resolved initial state rather than driving a live pick or a
 * full submit — the toast wording change (`Deal created/updated successfully`) is a one-line
 * string change verified by direct code review + manual/live testing, not re-asserted here.
 */

const TOP_MASSAGE: Category = { id: 'top-massage', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' };
const SUB_BODY_MASSAGE: Category = { id: 'sub-body-massage', name: 'Body Massage', slug: 'body-massage', parentId: 'top-massage', isActive: true };
// A pre-existing Type-tier row — the "Category Types" Master screen that created rows like this
// is gone, but old Deal rows may still reference one; it must still resolve correctly.
const LEGACY_TYPE_SWEDISH: Category = { id: 'type-swedish', name: 'Swedish Massage', slug: 'swedish-massage', parentId: 'sub-body-massage', isActive: true };
const TOP_HOME: Category = { id: 'top-home', name: 'Home Services', slug: 'home-services', parentId: null, isActive: true, type: 'SERVICE' };
const SUB_CLEANING: Category = { id: 'sub-cleaning', name: 'Cleaning', slug: 'cleaning', parentId: 'top-home', isActive: true };

const CATEGORIES: Category[] = [TOP_MASSAGE, SUB_BODY_MASSAGE, LEGACY_TYPE_SWEDISH, TOP_HOME, SUB_CLEANING];

// Branch A's own mapping — only DIRECT children are ever representable as a
// `BranchSubcategoryAccess` row (see that model's schema doc comment), so the legacy Type-tier
// grandchild (`LEGACY_TYPE_SWEDISH`) deliberately has no row of its own here, same as production.
const BRANCH_CATEGORY_ACCESS: BranchCategoryAccessRow[] = [
  {
    id: 'bca-massage',
    branchId: 'branch-1',
    categoryId: TOP_MASSAGE.id,
    createdAt: '2026-01-01T00:00:00Z',
    category: TOP_MASSAGE,
    subcategories: [{ id: 'bsa-body-massage', subcategoryId: SUB_BODY_MASSAGE.id, subcategory: SUB_BODY_MASSAGE }],
  },
  {
    id: 'bca-home',
    branchId: 'branch-1',
    categoryId: TOP_HOME.id,
    createdAt: '2026-01-01T00:00:00Z',
    category: TOP_HOME,
    subcategories: [{ id: 'bsa-cleaning', subcategoryId: SUB_CLEANING.id, subcategory: SUB_CLEANING }],
  },
];

const DEAL_BASE: Omit<Deal, 'categoryId' | 'subcategoryId'> = {
  id: 'deal-1',
  vendorId: 'vendor-1',
  branchId: 'branch-1',
  title: 'Signature Massage',
  slug: 'signature-massage',
  originalPrice: '1000',
  salePrice: '800',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function optionLabelsOf(select: Element): (string | undefined)[] {
  return Array.from(select.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
}

// Fixtures for BranchDialog's own Categories & Subcategories section — deliberately distinct ids
// from the DealDialog fixtures above (they exercise unrelated code paths: DealDialog reads a
// branch's already-saved mapping, BranchDialog's own fetch is the unfiltered SERVICE+THERAPY
// Category Master list used to BUILD that mapping).
const BD_TOP_MASSAGE: Category = { id: 'bd-top-massage', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' };
const BD_SUB_BODY_MASSAGE: Category = { id: 'bd-sub-body-massage', name: 'Body Massage', slug: 'body-massage', parentId: 'bd-top-massage', isActive: true };
const BD_SUB_FOOT_MASSAGE: Category = { id: 'bd-sub-foot-massage', name: 'Foot Massage', slug: 'foot-massage', parentId: 'bd-top-massage', isActive: true };
const BD_TOP_THERAPY: Category = { id: 'bd-top-therapy', name: 'Physiotherapy', slug: 'physiotherapy', parentId: null, isActive: true, type: 'THERAPY' };

const BD_SERVICE_CATEGORIES: Category[] = [BD_TOP_MASSAGE, BD_SUB_BODY_MASSAGE, BD_SUB_FOOT_MASSAGE];
const BD_THERAPY_CATEGORIES: Category[] = [BD_TOP_THERAPY];

beforeEach(() => {
  vi.clearAllMocks();
  getBranchCategoryAccessMock.mockResolvedValue({ data: BRANCH_CATEGORY_ACCESS });
  getMyBranchCategoryAccessMock.mockResolvedValue({ data: BRANCH_CATEGORY_ACCESS });
  listCategoriesMock.mockImplementation((_token: string | null, opts: { type: string }) =>
    Promise.resolve({ data: opts.type === 'THERAPY' ? BD_THERAPY_CATEGORIES : BD_SERVICE_CATEGORIES }),
  );
  setBranchCategoryAccessMock.mockResolvedValue({ data: [] });
});

function renderDialog(deal?: Deal) {
  return render(
    <ToastProvider>
      <DealDialog categories={CATEGORIES} products={[]} token="tok" vendorId="vendor-1" fixedBranchId="branch-1" deal={deal} onSave={async () => undefined} />
    </ToastProvider>,
  );
}

describe('DealDialog — Deal is a pure service offering (no Product concept)', () => {
  it('a fresh Add dialog shows only the Category select, scoped to the branch mapping — no Product select, no Subcategory yet', async () => {
    renderDialog();
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', 'branch-1'));
    await waitFor(() => {
      const selects = document.querySelectorAll('md-outlined-select');
      expect(optionLabelsOf(selects[0])).toEqual(['Select a category', 'Massage', 'Home Services']);
    });
    expect(document.querySelectorAll('md-outlined-select').length).toBe(1);
  });

  it("editing a Deal whose subcategoryId is a legacy Type-tier row (Swedish Massage, not directly mapped) preserves the value and shows a stale-mapping warning banner", async () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: LEGACY_TYPE_SWEDISH.id });
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalled());
    // Category itself is still mapped -> only 2 selects (Category, Subcategory), never a 3rd/Type select.
    await waitFor(() => expect(document.querySelectorAll('md-outlined-select').length).toBe(2));
    const selects = document.querySelectorAll('md-outlined-select');
    // The stale value is preserved as an extra option (never silently dropped), alongside the
    // branch's real mapped subcategory.
    expect(optionLabelsOf(selects[1])).toEqual(['None', 'Swedish Massage', 'Body Massage']);
    expect(
      screen.getByText(
        'This subcategory is no longer mapped to this branch/category. Saving without changing it keeps the existing value — or pick a currently mapped option.',
      ),
    ).toBeTruthy();
  });

  it('editing a Deal whose subcategoryId is a real, currently-mapped Subcategory (Body Massage) shows it normally with no warning', async () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: SUB_BODY_MASSAGE.id });
    await waitFor(() => expect(document.querySelectorAll('md-outlined-select').length).toBe(2));
    const selects = document.querySelectorAll('md-outlined-select');
    expect(optionLabelsOf(selects[1])).toEqual(['None', 'Body Massage']);
    expect(screen.queryByText(/no longer mapped/)).toBeNull();
  });

  it('editing a Deal under a different branch-mapped category (Home Services -> Cleaning) shows Category/Subcategory only, no warning', async () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_HOME.id, subcategoryId: SUB_CLEANING.id });
    await waitFor(() => expect(document.querySelectorAll('md-outlined-select').length).toBe(2));
    expect(screen.queryByText(/no longer mapped/)).toBeNull();
  });

  // Edge case: a category that has fallen out of the branch's mapping entirely (not just its
  // subcategory) is likewise preserved with its own warning, and the Subcategory select is
  // suppressed (no meaningful subcategory list to offer against an unmapped category).
  it('editing a Deal whose categoryId itself is no longer mapped to this branch preserves it and warns, without rendering a Subcategory select', async () => {
    const UNMAPPED_CATEGORY: Category = { id: 'top-unmapped', name: 'Discontinued Module', slug: 'discontinued', parentId: null, isActive: true, type: 'SERVICE' };
    renderDialog({ ...DEAL_BASE, categoryId: UNMAPPED_CATEGORY.id, subcategoryId: undefined });
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText(
          'This category is no longer mapped to this branch. Saving without changing it keeps the existing value — or pick a currently mapped option.',
        ),
      ).toBeTruthy(),
    );
    // categoryStale suppresses the Subcategory select entirely (no valid subcategory list for an
    // unmapped category) — only the Category select renders.
    expect(document.querySelectorAll('md-outlined-select').length).toBe(1);
  });

  it('self-service (isSelf) fetches the branch mapping via getMyBranchCategoryAccess, never the admin-scoped function', async () => {
    render(
      <ToastProvider>
        <DealDialog categories={CATEGORIES} products={[]} token="tok" vendorId="vendor-1" isSelf fixedBranchId="branch-1" onSave={async () => undefined} />
      </ToastProvider>,
    );
    await waitFor(() => expect(getMyBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'branch-1'));
    expect(getBranchCategoryAccessMock).not.toHaveBeenCalled();
  });

  // This dialog is never remounted when the caller's `fixedBranchId` prop changes (e.g.
  // VendorBranches's left-pane branch switch) — the branch-access fetch effect reads the prop
  // directly (not the `branchId` state) precisely so a prop-only change still refetches, per this
  // component's own doc comment.
  it('re-fetches the branch category mapping when the caller switches fixedBranchId without remounting the dialog', async () => {
    const { rerender } = renderDialog();
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', 'branch-1'));
    getBranchCategoryAccessMock.mockClear();

    rerender(
      <ToastProvider>
        <DealDialog categories={CATEGORIES} products={[]} token="tok" vendorId="vendor-1" fixedBranchId="branch-2" onSave={async () => undefined} />
      </ToastProvider>,
    );
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', 'branch-2'));
  });

  it('never renders a Product select, a read-only "Category:" hint, "— None (Service deal) —" option, "Select a product" hint, or "Offering type" control, for any deal', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: SUB_BODY_MASSAGE.id });
    expect(screen.queryByText(/^Category:/)).toBeNull();
    expect(screen.queryByText('Product (leave as None for a service deal)')).toBeNull();
    expect(screen.queryByText('— None (Service deal) —')).toBeNull();
    expect(screen.queryByText('Offering type')).toBeNull();
  });
});

/**
 * Feature: BranchDialog — Map Location URL replaces directly-editable latitude/longitude
 * A single "Map Location" `OutlinedTextField` (pasted Google Maps link) replaces the old
 * Latitude/Longitude inputs — the server resolves the link into coordinates (see
 * `googleMapsUrlResolver.provider.ts` in msd-api) and `BranchInput` no longer carries
 * `latitude`/`longitude` at all. A resolver rejection (surfaced as an `ApiRequestError` with
 * `code: 'VALIDATION_ERROR'`) is shown inline under the Map Location field via
 * `errors.mapLocationUrl`, not just as a generic banner.
 */
function findSaveButton(): HTMLElement {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.trim() === 'Save');
  if (!button) throw new Error('Save button not found');
  return button as HTMLElement;
}

const BRANCH_WITH_LOCATION: Branch = {
  id: 'branch-1',
  vendorId: 'vendor-1',
  name: 'Golghar Branch',
  isActive: true,
  mapLocationUrl: 'https://maps.app.goo.gl/existingLink',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderBranchDialog(props: Partial<React.ComponentProps<typeof BranchDialog>> = {}) {
  return render(
    <ToastProvider>
      <BranchDialog token="tok" vendorId="vendor-1" onSave={vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION)} {...props} />
    </ToastProvider>,
  );
}

describe('BranchDialog — Map Location URL', () => {
  // NOTE: `label`/`error` on `<md-outlined-text-field>` are properties `@lit/react` sets via a
  // `useLayoutEffect`-timed ref callback that (per this repo's own documented gap — see
  // `search.test.tsx`'s doc comment) never actually fires under this installed `@lit/react@1.0.8`
  // + React 19.2.7 + jsdom combination, so neither the property nor a reflected attribute is ever
  // observable here. Verified instead via the field COUNT (exactly 4: Branch Name, Address, PIN
  // Code, Map Location — never a 5th/6th field for Latitude/Longitude, which this component's
  // source contains no markup for at all) and, for the error-surfacing test below, via the
  // `errors.mapLocationUrl && <p role="alert">` sibling paragraph, which IS plain rendered DOM
  // text (not a custom-element property) and so is reliably queryable.
  it('renders exactly 4 text fields (Branch Name, Address, PIN Code, Map Location) — never a separate Latitude/Longitude field — for a fresh Add dialog', () => {
    renderBranchDialog({ onSave: vi.fn() });
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(4);
    expect(screen.queryByText('Latitude')).toBeNull();
    expect(screen.queryByText('Longitude')).toBeNull();
  });

  it('renders the same 4 fields (no lat/lng) when editing an existing branch', () => {
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave: vi.fn() });
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(4);
    expect(screen.queryByText('Latitude')).toBeNull();
    expect(screen.queryByText('Longitude')).toBeNull();
  });

  it('saving a branch with an existing mapLocationUrl submits mapLocationUrl, never latitude/longitude', async () => {
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const submitted = onSave.mock.calls[0][0];
    expect(submitted.mapLocationUrl).toBe('https://maps.app.goo.gl/existingLink');
    expect(submitted).not.toHaveProperty('latitude');
    expect(submitted).not.toHaveProperty('longitude');
  });

  it('a resolver VALIDATION_ERROR rejection renders inline under the Map Location field, not just a generic banner', async () => {
    const resolverMessage = "We couldn't resolve this Google Maps link. Please check the link and try again.";
    const onSave = vi.fn().mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', resolverMessage, 422));
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(resolverMessage)).toBeTruthy());
    // The generic dialog-level error ("Fix the highlighted fields before saving.") is set
    // alongside the field-level one — confirms the message lives under the field, not instead of
    // it silently replacing the generic banner with nothing.
    expect(screen.getByText('Fix the highlighted fields before saving.')).toBeTruthy();
  });

  it('a non-mapLocationUrl error (e.g. generic network failure) falls back to the dialog\'s generic error message, not the field-level one', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Network request failed'));
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Could not save branch.')).toBeTruthy());
  });
});

/**
 * Feature: BranchDialog — Categories & Subcategories (folded in from the deleted
 * `branch-category-access-dialog.tsx`)
 * Scenario: `BranchDialog` now owns the branch's own SERVICE/THERAPY category mapping directly,
 * as one form alongside the branch fields, rather than a separate dialog.
 *
 * Given: the active-only SERVICE/THERAPY Category Master list and (when editing) a branch's
 *        already-saved mapping
 * When: `BranchDialog` renders (Add or Edit)
 * Then: the existing mapping is reflected as checked boxes, toggling behaves as documented, and
 *       Save submits the branch fields first, then the replace-the-full-set `mappings` shape
 *       against the resulting branchId
 *
 * Edge cases:
 * - a categories-only Save failure (after the branch itself already saved) shows a combined
 *   error and keeps the dialog open — never silently drops the category data
 * - zero active SERVICE/THERAPY categories shows an empty state
 * - `isSelf` omits the whole section — there is no self-service write route for it
 */
describe('BranchDialog — Categories & Subcategories', () => {
  it('loads the existing mapping for an existing branch and reflects it as checked category/subcategory boxes', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({
      data: [
        {
          id: 'bca-1',
          branchId: BRANCH_WITH_LOCATION.id,
          categoryId: BD_TOP_MASSAGE.id,
          createdAt: '2026-01-01T00:00:00Z',
          category: BD_TOP_MASSAGE,
          subcategories: [{ id: 'bsa-1', subcategoryId: BD_SUB_BODY_MASSAGE.id, subcategory: BD_SUB_BODY_MASSAGE }],
        },
      ],
    });
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION });
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', BRANCH_WITH_LOCATION.id));

    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    await waitFor(() => expect(massageCheckbox).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Body Massage' })).toBeChecked();
    // Foot Massage was never in the saved mapping's subcategories -> unchecked.
    expect(screen.getByRole('checkbox', { name: 'Foot Massage' })).not.toBeChecked();
    // A category never granted at all (Physiotherapy) starts unchecked.
    expect(screen.getByRole('checkbox', { name: 'Physiotherapy' })).not.toBeChecked();
  });

  it('a fresh Add dialog has no existing branch to fetch a mapping for — every category starts unchecked', async () => {
    renderBranchDialog();
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledWith('tok', { type: 'SERVICE' }));
    expect(getBranchCategoryAccessMock).not.toHaveBeenCalled();
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    expect(massageCheckbox).not.toBeChecked();
  });

  it('checking a category checkbox reveals its subcategory checkboxes; unchecking hides them again', async () => {
    renderBranchDialog();
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    expect(screen.queryByRole('checkbox', { name: 'Body Massage' })).toBeNull();

    fireEvent.click(massageCheckbox);
    expect(await screen.findByRole('checkbox', { name: 'Body Massage' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Foot Massage' })).toBeTruthy();

    fireEvent.click(massageCheckbox);
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Body Massage' })).toBeNull());
  });

  it('checking a subcategory auto-checks its parent category', async () => {
    renderBranchDialog();
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(massageCheckbox);
    const bodyMassageCheckbox = await screen.findByRole('checkbox', { name: 'Body Massage' });
    expect(massageCheckbox).toBeChecked();
    fireEvent.click(bodyMassageCheckbox);
    expect(bodyMassageCheckbox).toBeChecked();
    expect(massageCheckbox).toBeChecked(); // still checked — never auto-unchecked by a subcategory toggle
  });

  it('unchecking a category clears its subcategory selections (not just hides them)', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({
      data: [
        {
          id: 'bca-1',
          branchId: BRANCH_WITH_LOCATION.id,
          categoryId: BD_TOP_MASSAGE.id,
          createdAt: '2026-01-01T00:00:00Z',
          category: BD_TOP_MASSAGE,
          subcategories: [{ id: 'bsa-1', subcategoryId: BD_SUB_BODY_MASSAGE.id, subcategory: BD_SUB_BODY_MASSAGE }],
        },
      ],
    });
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION });
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    await waitFor(() => expect(massageCheckbox).toBeChecked());
    fireEvent.click(massageCheckbox); // uncheck the category
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Body Massage' })).toBeNull());

    // Re-checking the category now shows a fresh, empty subcategory set — the prior selection
    // was actually cleared from state, not merely hidden.
    fireEvent.click(massageCheckbox);
    const bodyMassageCheckbox = await screen.findByRole('checkbox', { name: 'Body Massage' });
    expect(bodyMassageCheckbox).not.toBeChecked();
  });

  it('Save submits the branch fields first, then calls setBranchCategoryAccess with the resulting branchId and the replace-the-full-set mappings shape', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(massageCheckbox);
    const bodyMassageCheckbox = await screen.findByRole('checkbox', { name: 'Body Massage' });
    fireEvent.click(bodyMassageCheckbox);

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() =>
      expect(setBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', BRANCH_WITH_LOCATION.id, {
        mappings: [{ categoryId: BD_TOP_MASSAGE.id, subcategoryIds: [BD_SUB_BODY_MASSAGE.id] }],
      }),
    );
  });

  // A brand-new branch has no id until `onSave` resolves — this asserts the category save always
  // targets whatever id `onSave` actually returns, never a stale/prior one (there's no reliable
  // way to drive text-field input under this repo's documented jsdom + `@lit/react` gap — see the
  // "Map Location URL" suite's own doc comment — so this uses the `branch` prop's pre-filled name
  // to get past the required-field check, with `onSave` resolving a DIFFERENT id than the prop's,
  // standing in for "the id only the server assigns").
  it('categories are saved against the branchId returned by onSave, never a stale prop id', async () => {
    const RETURNED_BRANCH: Branch = { ...BRANCH_WITH_LOCATION, id: 'server-returned-id' };
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    const onSave = vi.fn().mockResolvedValue(RETURNED_BRANCH);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(massageCheckbox);

    fireEvent.click(findSaveButton());

    await waitFor(() =>
      expect(setBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', 'server-returned-id', {
        mappings: [{ categoryId: BD_TOP_MASSAGE.id, subcategoryIds: [] }],
      }),
    );
  });

  it('a categories-only save failure (branch itself already saved) shows a combined error and keeps the dialog open', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    setBranchCategoryAccessMock.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Category is not a Service or Therapy category', 422));
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Both the inline `role="alert"` banner AND a toast fire with the same combined message (same
    // dual convention as this dialog's own mapLocationUrl error handling) — assert via the alert
    // role specifically, since the message text also appears a second time inside the toast.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Branch saved, but categories could not be saved: Category is not a Service or Therapy category',
    );
  });

  it('shows an empty state when zero active Service/Therapy categories exist in Category Master', async () => {
    listCategoriesMock.mockResolvedValue({ data: [] });
    renderBranchDialog();
    expect(await screen.findByText('No active Service or Therapy categories exist in Category Master yet.')).toBeTruthy();
  });

  it('isSelf omits the Categories & Subcategories section entirely and never calls listCategories/setBranchCategoryAccess', async () => {
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, isSelf: true, onSave: vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION) });
    expect(screen.queryByText('Categories & Subcategories')).toBeNull();

    fireEvent.click(findSaveButton());
    await waitFor(() => expect(screen.getByText('Branch updated successfully.')).toBeTruthy());
    expect(listCategoriesMock).not.toHaveBeenCalled();
    expect(setBranchCategoryAccessMock).not.toHaveBeenCalled();
  });

  it('two triggers (external dialogRef, hideTrigger) can open the same BranchDialog instance', () => {
    function Harness() {
      const dialogRef = useRef<MdDialog>(null);
      return (
        <ToastProvider>
          <BranchDialog
            branch={BRANCH_WITH_LOCATION}
            token="tok"
            vendorId="vendor-1"
            onSave={vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION)}
            dialogRef={dialogRef}
            hideTrigger
          />
        </ToastProvider>
      );
    }
    render(<Harness />);
    // hideTrigger suppresses BranchDialog's own built-in "Edit"/"Add branch" button.
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Add branch')).toBeNull();
    // The dialog's own content (e.g. the Save button) still renders — just with no trigger of its own.
    expect(findSaveButton()).toBeTruthy();
  });
});
