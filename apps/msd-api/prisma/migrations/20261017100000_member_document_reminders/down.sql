-- Manual rollback. Postgres cannot drop an enum value, so NotificationType keeps
-- MEMBER_REVIEW_FLAGGED; delete its rows first so nothing reads an unused type.
DELETE FROM "Notification" WHERE "type" = 'MEMBER_REVIEW_FLAGGED';
DROP TABLE "MemberDocumentReminder";
DROP TYPE "ReminderDelivery";
