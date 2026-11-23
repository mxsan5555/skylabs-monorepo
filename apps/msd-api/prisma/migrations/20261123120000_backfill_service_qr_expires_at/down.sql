-- Rolls back 20261123120000_backfill_service_qr_expires_at.
--
-- This is a one-way data repair, not meaningfully reversible: by the time a rollback would run,
-- new SERVICE_SESSION entitlements may have been created normally (via
-- settlement.service.ts#createEntitlementsForOrder) with their own legitimate, non-backfilled
-- qrExpiresAt — there is no way to distinguish those from the ones this migration touched, so a
-- blanket re-null would incorrectly wipe real data. No-op by design.
SELECT 1;
