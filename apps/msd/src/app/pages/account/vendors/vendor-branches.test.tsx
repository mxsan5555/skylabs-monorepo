import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Category, Deal } from '../../../../api/rbac/vendors';
import { DealDialog } from './vendor-branches';

/**
 * Feature: DealDialog — Category/Subcategory selects (2-level only)
 * Scenario: a service Deal picks a Category then an optional Subcategory. The former 3rd,
 * Type-tier picker ("Swedish Massage" under "Body Massage") has been removed along with the
 * "Category Types" Master screen it depended on — a Deal's `subcategoryId` is only ever set via
 * the Subcategory select now. A pre-existing Deal whose stored `subcategoryId` happens to be an
 * old Type-tier id (from before this removal) must still resolve to the correct Subcategory
 * selection for display, without crashing or losing the value.
 *
 * Given: the vendor's granted SERVICE categories include a Subcategory with Type-tier children
 *        that pre-date this removal, and a 2-level-only branch
 * When: DealDialog renders (fresh Add, or editing an existing Deal at either depth)
 * Then: only Product + Category + (optional) Subcategory selects ever render — never a 3rd Type
 *       select, regardless of the underlying category tree's depth
 *
 * Edge cases:
 * - a fresh Add dialog (no category picked yet) shows neither Subcategory
 * - editing a Deal whose stored subcategoryId is an old Type-tier row still shows the correct
 *   Subcategory pre-selected, with no Type select appearing
 * - a Product-offering deal never shows any of the Service category selects at all (regression)
 *
 * NOTE: like `categories.test.tsx`'s suite, live select-interaction can't be simulated under this
 * jsdom + `@lit/react` + React 19 combination (documented in `search.test.tsx`), so this suite
 * verifies via each dialog's already-resolved initial state rather than driving a live pick.
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

describe('DealDialog — Category/Subcategory selects (no Type-tier picker)', () => {
  it('a fresh Add dialog (no category picked yet) shows only the Product + Category selects — no Subcategory', () => {
    renderDialog();
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(2); // Product (always visible, no separate "Offering type" toggle), Category
    const categorySelect = selects[1];
    expect(optionLabelsOf(categorySelect)).toEqual(['Select a category', 'Massage', 'Home Services']);
  });

  it('editing a Deal whose subcategoryId is a legacy Type-tier row (Swedish Massage) resolves the correct Subcategory, with no Type select rendered', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: LEGACY_TYPE_SWEDISH.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(3); // Product, Category, Subcategory — never a 3rd Type select
    const subcategorySelect = selects[2];
    expect(optionLabelsOf(subcategorySelect)).toEqual(['None', 'Body Massage']);
    expect(screen.queryByText('Type (optional)')).toBeNull();
  });

  it('editing a Deal whose subcategoryId is a real Subcategory (Body Massage) shows exactly Product/Category/Subcategory, no Type select', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: SUB_BODY_MASSAGE.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(3);
    expect(screen.queryByText('Type (optional)')).toBeNull();
  });

  // Regression / core edge case: a 2-level-only branch (Home Services -> Cleaning) keeps working.
  it('editing a Deal under a 2-level-only branch (Home Services -> Cleaning) shows Product/Category/Subcategory only', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_HOME.id, subcategoryId: SUB_CLEANING.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(3);
  });

  // Regression: a Product-offering deal never renders any of the Service category selects.
  it('a Product-offering deal shows only the Product picker, not the Service Category/Subcategory cascade', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: null, productId: 'product-1' });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(1); // Product only — no separate "Offering type" toggle exists
    expect(screen.queryByText('Type (optional)')).toBeNull();
  });

  // Root-cause regression check for the removed "Offering type" toggle itself: there is no
  // control with that label anywhere — picking a Product (or leaving it at "None") is the only
  // signal, matching the backend's own productId-presence convention.
  it('never renders an "Offering type" control — Service vs Product is derived from the Product picker alone', () => {
    renderDialog();
    expect(screen.queryByText('Offering type')).toBeNull();
    const productSelect = document.querySelectorAll('md-outlined-select')[0];
    expect(optionLabelsOf(productSelect)[0]).toBe('— None (Service deal) —');
  });
});
