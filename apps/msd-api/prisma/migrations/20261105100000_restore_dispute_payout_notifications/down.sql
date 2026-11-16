-- Rolls back 20261105100000_restore_dispute_payout_notifications. Postgres cannot drop an enum
-- value, so this recreates the type and deletes the notifications that used the two values.
DELETE FROM "Notification" WHERE "type"::text IN ('DISPUTE_RAISED', 'PAYOUT_RECORDED');
CREATE TYPE "NotificationType_old" AS ENUM ('DEAL_PENDING_APPROVAL', 'ORDER_RECEIVED', 'VENDOR_PENDING_APPROVAL', 'MEMBER_SUSPENDED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'MEMBER_REVIEW_FLAGGED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_old" USING ("type"::text::"NotificationType_old");
DROP TYPE "NotificationType";
ALTER TYPE "NotificationType_old" RENAME TO "NotificationType";
