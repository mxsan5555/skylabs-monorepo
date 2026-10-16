-- Manual rollback. Cannot restore REJECTED (they stay SUSPENDED) and cannot remove
-- NotificationType values (Postgres has no DROP VALUE); the extra values are harmless.
UPDATE "Role" SET "key" = 'vendor', "name" = 'Vendor' WHERE "key" = 'member';

DROP TABLE "MemberStatusHistory";

DROP INDEX "VendorDocument_status_expiresAt_idx";
DROP INDEX "VendorDocument_documentType_numberHash_key";
ALTER TABLE "VendorDocument"
  DROP COLUMN "status", DROP COLUMN "numberMasked", DROP COLUMN "numberHash",
  DROP COLUMN "numberEncrypted", DROP COLUMN "rejectionReason", DROP COLUMN "reviewedByUserId",
  DROP COLUMN "reviewedAt", DROP COLUMN "expiresAt", DROP COLUMN "uploadedByUserId",
  DROP COLUMN "uploadedOnBehalf";
DROP TYPE "MemberDocumentStatus";

ALTER TABLE "Vendor"
  DROP COLUMN "statusChangedAt", DROP COLUMN "statusChangedByUserId", DROP COLUMN "archivedAt",
  DROP COLUMN "documentsDueAt", DROP COLUMN "reviewFlaggedAt", DROP COLUMN "welcomeSentAt";

CREATE TYPE "VendorStatus" AS ENUM
  ('PROFILE_INCOMPLETE', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'ACTIVE', 'INACTIVE', 'SUSPENDED');
ALTER TABLE "Vendor" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Vendor" ALTER COLUMN "status" TYPE "VendorStatus" USING (
  CASE "status"::text WHEN 'ARCHIVED' THEN 'SUSPENDED' ELSE "status"::text END
)::"VendorStatus";
ALTER TABLE "Vendor" ALTER COLUMN "status" SET DEFAULT 'PROFILE_INCOMPLETE';
DROP TYPE "MemberStatus";
