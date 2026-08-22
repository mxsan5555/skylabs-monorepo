import { useState } from 'react';
import type { CatalogTherapistPackage } from '../api/catalog';

/**
 * THE canonical package/price selection logic for booking a Therapist directly (no Deal
 * involved at all — see msd-api's Booking "exactly one of dealId/therapistId" doc comment).
 * Mirrors `useDealPurchaseSelection`'s shape so `DurationPackageSelector`-style UI patterns stay
 * familiar, but there is no Deal here — the Therapist's OWN `packages` are the only source of
 * duration/price options. The backend (`booking.service.ts#createBookingFromTherapist`)
 * re-resolves this same package server-side — this hook only ever computes a value for display,
 * never trusted as the charge.
 */
export function useTherapistPurchaseSelection(packages: CatalogTherapistPackage[]) {
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(packages[0]?.id ?? null);

  const activePackage = packages.find((p) => p.id === selectedPackageId) ?? packages[0] ?? null;
  const unitPrice = activePackage ? Number(activePackage.sellingPrice) : 0;

  const missingSelection = packages.length === 0
    ? 'This therapist has no bookable packages yet.'
    : !activePackage
      ? 'Please select a duration.'
      : null;

  const selectPackage = (packageId: string) => setSelectedPackageId(packageId);

  return {
    packages,
    selectedPackageId,
    selectPackage,
    activePackage,
    unitPrice,
    missingSelection,
  };
}

export type TherapistPurchaseSelection = ReturnType<typeof useTherapistPurchaseSelection>;
