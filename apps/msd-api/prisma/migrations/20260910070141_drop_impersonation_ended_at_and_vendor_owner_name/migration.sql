-- Drop dead/duplicate columns confirmed to have zero application-code references
-- (see production-readiness cleanup audit):
--   * ImpersonationSession.endedAt — no "end impersonation" flow was ever built;
--     nothing ever set or read this column.
--   * Vendor.ownerName — legacy pre-first/last-name-split field; only consumer
--     was the admin vendor search filter, now removed from vendor.service.ts.

-- AlterTable
ALTER TABLE "ImpersonationSession" DROP COLUMN "endedAt";

-- AlterTable
ALTER TABLE "Vendor" DROP COLUMN "ownerName";
