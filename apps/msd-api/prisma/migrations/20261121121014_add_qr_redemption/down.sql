-- Rolls back 20261121121014_add_qr_redemption.
ALTER TABLE "PurchaseEntitlement" DROP COLUMN "qrExpiresAt";
ALTER TABLE "PurchaseEntitlement" DROP COLUMN "redeemedByUserId";
