-- Disputes and payouts notify members and super admins, but 20261029073832 dropped these two
-- values from the enum while dispute.service.ts and settlement.service.ts still send them.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISPUTE_RAISED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYOUT_RECORDED';
