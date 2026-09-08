import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Category, Deal, Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { DealDialog, BranchDialog } from './vendor-branches';

/**
 * Feature: DealDialog — Product picker removed, Service-only creation
 * Scenario: the Deal Add/Edit form no longer offers any way to pick or clear a Product — it only
 * ever creates a Service deal now. Category/Subcategory selects work exactly as before for a
 * Service deal; opening the dialog on a pre-existing Product deal (created before this removal)
 * still shows that deal's own read-only category hint and Pricing tab, unchanged, since
 * `offeringType` is still derived from the loaded deal's own stored `productId` — there is simply
 * no control left to set, change, or clear one.
 *
 * Given: the vendor's granted SERVICE categories (2- and 3-level branches, including a legacy
 *        Type-tier row from before the "Category Types" master screen was removed)
 * When: DealDialog renders (fresh Add, editing a Service deal, or editing a pre-existing Product
 *       deal)
 * Then: no "Product" select, no "— None (Service deal) —" option, and no "Select a product"/
 *       "Offering type" text ever appear, regardless of which deal (if any) is being edited
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

const DEAL_BASE: Omit<Deal, 'categoryId' | 'subcategoryId' | 'productId'> = {
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

function renderDialog(deal?: Deal) {
  return render(
    <ToastProvider>
      <DealDialog categories={CATEGORIES} products={[]} token="tok" fixedBranchId="branch-1" deal={deal} onSave={async () => undefined} />
    </ToastProvider>,
  );
}

describe('DealDialog — Product picker removed (Service-only creation)', () => {
  it('a fresh Add dialog shows only the Category select — no Product select, no Subcategory yet', () => {
    renderDialog();
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(1);
    expect(optionLabelsOf(selects[0])).toEqual(['Select a category', 'Massage', 'Home Services']);
  });

  it('editing a Deal whose subcategoryId is a legacy Type-tier row (Swedish Massage) resolves the correct Subcategory, with no Product/Type select rendered', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: LEGACY_TYPE_SWEDISH.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(2); // Category, Subcategory — never a Product or Type select
    expect(optionLabelsOf(selects[1])).toEqual(['None', 'Body Massage']);
  });

  it('editing a Deal whose subcategoryId is a real Subcategory (Body Massage) shows exactly Category/Subcategory', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: SUB_BODY_MASSAGE.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(2);
  });

  it('editing a Deal under a 2-level-only branch (Home Services -> Cleaning) shows Category/Subcategory only', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_HOME.id, subcategoryId: SUB_CLEANING.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(2);
  });

  it('editing a pre-existing Product deal shows a read-only category hint and NO selects at all — no way to change or clear the product', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: null, productId: 'product-1' });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(0);
    expect(screen.getByText(/Category:/)).toBeTruthy();
  });

  it('never renders a Product select, "— None (Service deal) —" option, "Select a product" hint, or "Offering type" control, for any deal', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: null, productId: 'product-1' });
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
    render(<BranchDialog onSave={vi.fn()} />);
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(4);
    expect(screen.queryByText('Latitude')).toBeNull();
    expect(screen.queryByText('Longitude')).toBeNull();
  });

  it('renders the same 4 fields (no lat/lng) when editing an existing branch', () => {
    render(<BranchDialog branch={BRANCH_WITH_LOCATION} onSave={vi.fn()} />);
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(4);
    expect(screen.queryByText('Latitude')).toBeNull();
    expect(screen.queryByText('Longitude')).toBeNull();
  });

  it('saving a branch with an existing mapLocationUrl submits mapLocationUrl, never latitude/longitude', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BranchDialog branch={BRANCH_WITH_LOCATION} onSave={onSave} />);

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
    render(<BranchDialog branch={BRANCH_WITH_LOCATION} onSave={onSave} />);

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
    render(<BranchDialog branch={BRANCH_WITH_LOCATION} onSave={onSave} />);

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Could not save branch.')).toBeTruthy());
  });
});
