-- D40 follow-up (QR-scan-only vendor redemption redesign): backfill qrExpiresAt for every
-- SERVICE_SESSION entitlement created before migration 20261121121014_add_qr_redemption, which
-- never got one (no backfill ran at the time). Without this, redeemViaQr/finishService's
-- `qrExpiresAt > now()` guard can never match a NULL column, permanently blocking redemption of
-- every pre-existing deal/therapist voucher once the OTP completion path is removed.
--
-- Scoped to still-open entitlements only (ACTIVE/STARTED/OTP_REQUESTED) — a COMPLETED/CANCELLED/
-- REFUNDED entitlement's customer-facing QR display never depends on qrExpiresAt (see
-- order-item-card.tsx#qrStatusOf: COMPLETED short-circuits to "redeemed" regardless), so leaving
-- those rows untouched keeps this backfill's effect limited to vouchers vendors can still act on.
--
-- A backfilled value landing in the past is an accepted, correct outcome under the stated 30-day-
-- from-purchase rule (the voucher legitimately shows "Expired" under the new flow) — not a bug.
UPDATE "PurchaseEntitlement"
SET "qrExpiresAt" = "createdAt" + INTERVAL '30 days'
WHERE "fulfilmentKind" = 'SERVICE_SESSION'
  AND "qrExpiresAt" IS NULL
  AND "entitlementStatus" IN ('ACTIVE', 'STARTED', 'OTP_REQUESTED');
