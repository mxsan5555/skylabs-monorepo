-- Member lifecycle: status model, document review fields, status history, role rename.
-- Order matters: the REJECTED reason is recorded before the enum type is swapped.

UPDATE "Vendor"
SET "statusReason" = CASE
  WHEN "statusReason" IS NULL OR "statusReason" = '' THEN 'Migrated from rejected'
  ELSE 'Migrated from rejected: ' || "statusReason"
END
WHERE "status"::text = 'REJECTED';

CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

ALTER TABLE "Vendor" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Vendor" ALTER COLUMN "status" TYPE "MemberStatus" USING (
  CASE "status"::text
    WHEN 'INACTIVE' THEN 'INACTIVE'
    WHEN 'SUSPENDED' THEN 'SUSPENDED'
    WHEN 'REJECTED' THEN 'SUSPENDED'
    ELSE 'ACTIVE'
  END
)::"MemberStatus";
ALTER TABLE "Vendor" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "VendorStatus";

ALTER TABLE "Vendor"
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "statusChangedByUserId" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "documentsDueAt" TIMESTAMP(3),
  ADD COLUMN "reviewFlaggedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeSentAt" TIMESTAMP(3);

UPDATE "Vendor"
SET "statusChangedAt" = "updatedAt",
    "documentsDueAt" = NOW() + INTERVAL '14 days';

CREATE TYPE "MemberDocumentStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED');

ALTER TABLE "VendorDocument"
  ADD COLUMN "status" "MemberDocumentStatus" NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN "numberMasked" TEXT,
  ADD COLUMN "numberHash" TEXT,
  ADD COLUMN "numberEncrypted" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "uploadedByUserId" TEXT,
  ADD COLUMN "uploadedOnBehalf" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "VendorDocument_documentType_numberHash_key" ON "VendorDocument"("documentType", "numberHash");
CREATE INDEX "VendorDocument_status_expiresAt_idx" ON "VendorDocument"("status", "expiresAt");

CREATE TABLE "MemberStatusHistory" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "fromStatus" "MemberStatus" NOT NULL,
  "toStatus" "MemberStatus" NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberStatusHistory_memberId_createdAt_idx" ON "MemberStatusHistory"("memberId", "createdAt");

ALTER TABLE "MemberStatusHistory"
  ADD CONSTRAINT "MemberStatusHistory_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_SUSPENDED';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_REJECTED';

-- Role rename keeps every UserRole link, because UserRole points at the role id.
UPDATE "Role" SET "key" = 'member', "name" = 'Member' WHERE "key" = 'vendor';
