import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { Category, Deal } from '../../../../api/rbac/vendors';
import { DealDialog } from './vendor-branches';

/**
 * Feature: DealDialog — optional 3rd, Type-tier category select
 * Scenario: a service Deal's Category/Subcategory pickers grow an optional 3rd "Type" picker
 * (e.g. "Swedish Massage" under "Body Massage" under "Massage") only when the currently-resolved
 * Subcategory actually has its own children — a 2-level branch (e.g. Home Services -> Cleaning)
 * must keep working exactly as before, with no 3rd select ever rendered.
 *
 * Given: the vendor's granted SERVICE categories include both a 3-level chain and a 2-level-only
 *        chain
 * When: DealDialog renders (fresh Add, or editing an existing Deal at either depth)
 * Then: the Type select renders iff the resolved Subcategory has children; picking one becomes
 *       the Deal's own `subcategoryId` (see `resolveCategoryTiers`'s own doc comment + its
 *       dedicated unit tests in `utils/category-tree.test.ts` for the underlying tier math)
 *
 * Edge cases:
 * - a fresh Add dialog (no category picked yet) shows neither Subcategory nor Type
 * - a Product-offering deal never shows any of the Service category selects at all (regression)
 *
 * NOTE: like `categories.test.tsx`'s leaf-scope suite, live select-interaction can't be simulated
 * under this jsdom + `@lit/react` + React 19 combination (documented in `search.test.tsx`), so
 * this suite verifies the same cascade via each dialog's already-resolved initial state (Add vs.
 * editing an existing Deal at a given depth) rather than driving a live pick. The interactive
 * "vendor picks Category -> Subcategory -> Type and saves" flow is covered at the Playwright E2E
 * level (see `apps/msd-e2e/src/category-taxonomy.spec.ts`).
 */

const TOP_MASSAGE: Category = { id: 'top-massage', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' };
const SUB_BODY_MASSAGE: Category = { id: 'sub-body-massage', name: 'Body Massage', slug: 'body-massage', parentId: 'top-massage', isActive: true };
const TYPE_SWEDISH: Category = { id: 'type-swedish', name: 'Swedish Massage', slug: 'swedish-massage', parentId: 'sub-body-massage', isActive: true };
const TOP_HOME: Category = { id: 'top-home', name: 'Home Services', slug: 'home-services', parentId: null, isActive: true, type: 'SERVICE' };
const SUB_CLEANING: Category = { id: 'sub-cleaning', name: 'Cleaning', slug: 'cleaning', parentId: 'top-home', isActive: true };

const CATEGORIES: Category[] = [TOP_MASSAGE, SUB_BODY_MASSAGE, TYPE_SWEDISH, TOP_HOME, SUB_CLEANING];

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

describe('DealDialog — Type-tier select (3-level categories)', () => {
  it('a fresh Add dialog (no category picked yet) shows only the Product + Category selects — no Subcategory, no Type', () => {
    renderDialog();
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(2); // Product (always visible, no separate "Offering type" toggle), Category
    const categorySelect = selects[1];
    expect(optionLabelsOf(categorySelect)).toEqual(['Select a category', 'Massage', 'Home Services']);
  });

  it('editing a Deal whose subcategoryId is a Type-tier row (Swedish Massage) shows all 4 selects, with Type\'s options scoped to its own siblings', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: TYPE_SWEDISH.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(4); // Product, Category, Subcategory, Type
    const [, , subcategorySelect, typeSelect] = selects;
    expect(optionLabelsOf(subcategorySelect)).toEqual(['None', 'Body Massage']);
    expect(optionLabelsOf(typeSelect)).toEqual(['None', 'Swedish Massage']);
  });

  it('editing a Deal whose subcategoryId is a real Subcategory (Body Massage, not yet drilled into a Type) still shows the Type select, since Body Massage has children', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_MASSAGE.id, subcategoryId: SUB_BODY_MASSAGE.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(4);
  });

  // Regression / core edge case: a 2-level-only branch (Home Services -> Cleaning) must keep
  // working exactly as before — Type select never renders since Cleaning has no children.
  it('editing a Deal under a 2-level-only branch (Home Services -> Cleaning) shows no Type select, unchanged from before', () => {
    renderDialog({ ...DEAL_BASE, categoryId: TOP_HOME.id, subcategoryId: SUB_CLEANING.id, productId: null });
    const selects = document.querySelectorAll('md-outlined-select');
    expect(selects.length).toBe(3); // Product, Category, Subcategory — no Type
    expect(screen.queryByText('Type (optional)')).toBeNull();
  });

  // Regression: a Product-offering deal never renders any of the Service category selects.
  it('a Product-offering deal shows only the Product picker, not the Service Category/Subcategory/Type cascade', () => {
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
