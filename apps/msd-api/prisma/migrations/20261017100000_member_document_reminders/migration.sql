-- Member document reminders (P6): scheduled warnings 1 to 3 and manual "Remind now" sends.
-- Requires 20261015100000_member_lifecycle (MemberStatus, documentsDueAt, reviewFlaggedAt).

CREATE TYPE "ReminderDelivery" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "MemberDocumentReminder" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "sequence" INTEGER,
  "missingTypes" "VendorDocumentType"[],
  "emailStatus" "ReminderDelivery",
  "smsStatus" "ReminderDelivery",
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "sentByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberDocumentReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberDocumentReminder_memberId_sequence_key" ON "MemberDocumentReminder"("memberId", "sequence");
CREATE INDEX "MemberDocumentReminder_memberId_createdAt_idx" ON "MemberDocumentReminder"("memberId", "createdAt");

ALTER TABLE "MemberDocumentReminder"
  ADD CONSTRAINT "MemberDocumentReminder_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE 'MEMBER_REVIEW_FLAGGED';
