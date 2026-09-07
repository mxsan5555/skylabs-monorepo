import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Category, Deal } from '../../../../api/rbac/vendors';
import { DealDialog } from './vendor-branches';

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
