import { useState } from 'react';
import type { CatalogDeal } from '../api/catalog';

/**
 * THE canonical duration/price selection logic for a service Deal — used by every purchase
 * entry point in the app (deal detail, category browse dialog, search "Book" action, vendor
 * page) so there is exactly one place that decides "which package, what price" instead of each
 * page quietly re-deriving its own.
 *
 * `deal.packages` is the Deal's own child DealPackage[] (a real table, mirrors TherapistPackage
 * exactly — see DealPackage's schema doc comment in msd-api), never sibling Deal rows — a
 * customer picks ONE package, and only that package's price/duration is ever charged.
 *
 * There is deliberately no in-flow "select a therapist to override the price" cross-selection
 * here anymore — a Therapist is only ever selected by clicking its own card (see
 * `useTherapistPurchaseSelection`/`TherapistPackageSelector`), never as an optional add-on
 * inside the Deal purchase flow.
 */
export function useDealPurchaseSelection(deal: CatalogDeal) {
  const packages = deal.packages;
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(packages[0]?.id ?? null);

  const activePackage = packages.find((p) => p.id === selectedPackageId) ?? packages[0] ?? null;

  const unitPrice = activePackage
    ? Number(activePackage.sellingPrice)
    : Number(deal.salePrice); // display-only fallback — never charged without a real package (see missingSelection below)

  // A Deal always requires a real DealPackage to add to cart — the backend's
  // cart.service.ts#assertServiceDeal has no "fall back to Deal.salePrice" path (that only ever
  // existed for the old Booking flow). Also fires for a deal a vendor forgot to attach any
  // package to (`packages.length === 0`).
  const missingSelection = !activePackage
    ? (packages.length === 0 ? 'This deal has no bookable packages yet.' : 'Please select a duration.')
    : null;

  const selectPackage = (packageId: string) => setSelectedPackageId(packageId);

  return {
    selectedPackageId,
    selectPackage,
    deal,
    packages,
    activePackage,
    unitPrice,
    missingSelection,
  };
}

export type DealPurchaseSelection = ReturnType<typeof useDealPurchaseSelection>;
