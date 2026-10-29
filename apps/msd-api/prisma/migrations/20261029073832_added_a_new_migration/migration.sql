/*
  Warnings:

  - The values [DISPUTE_RAISED,PAYOUT_RECORDED] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - The values [REQUESTED] on the enum `RefundStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [MANUAL_ADJUSTMENT] on the enum `SettlementAdjustmentType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `method` on the `MemberPayout` table. All the data in the column will be lost.
  - The `status` column on the `MemberPayout` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `deliveryEvidenceNote` on the `PurchaseEntitlement` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryEvidenceStorageKey` on the `PurchaseEntitlement` table. All the data in the column will be lost.
  - You are about to drop the column `recordedByUserId` on the `PurchaseEntitlement` table. All the data in the column will be lost.
  - The `settlementStatus` column on the `PurchaseEntitlement` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `preDisputeStatus` column on the `PurchaseEntitlement` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[payoutItemId]` on the table `PurchaseEntitlement` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `purpose` on the `CompletionOtpChallenge` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `entitlementId` on table `PurchaseDispute` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `fulfilmentKind` on the `PurchaseEntitlement` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PurchaseEntitlementFulfilmentKind" AS ENUM ('SERVICE_SESSION', 'PRODUCT_PICKUP', 'PRODUCT_SHIPPED');

-- CreateEnum
CREATE TYPE "PurchaseEntitlementSettlementStatus" AS ENUM ('PENDING_FULFILMENT', 'ON_HOLD', 'DISPUTED_BLOCKED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "MemberPayoutStatus" AS ENUM ('PAID');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('DEAL_PENDING_APPROVAL', 'ORDER_RECEIVED', 'VENDOR_PENDING_APPROVAL', 'MEMBER_SUSPENDED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'MEMBER_REVIEW_FLAGGED');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "RefundStatus_new" AS ENUM ('PROCESSED', 'PROCESSING', 'FAILED');
ALTER TABLE "public"."Refund" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Refund" ALTER COLUMN "status" TYPE "RefundStatus_new" USING ("status"::text::"RefundStatus_new");
ALTER TYPE "RefundStatus" RENAME TO "RefundStatus_old";
ALTER TYPE "RefundStatus_new" RENAME TO "RefundStatus";
DROP TYPE "public"."RefundStatus_old";
ALTER TABLE "Refund" ALTER COLUMN "status" SET DEFAULT 'PROCESSED';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SettlementAdjustmentType_new" AS ENUM ('REFUND', 'RECOVERY', 'COMMISSION', 'BONUS', 'OTHER');
ALTER TABLE "SettlementAdjustment" ALTER COLUMN "type" TYPE "SettlementAdjustmentType_new" USING ("type"::text::"SettlementAdjustmentType_new");
ALTER TYPE "SettlementAdjustmentType" RENAME TO "SettlementAdjustmentType_old";
ALTER TYPE "SettlementAdjustmentType_new" RENAME TO "SettlementAdjustmentType";
DROP TYPE "public"."SettlementAdjustmentType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "CompletionOtpChallenge" DROP CONSTRAINT "CompletionOtpChallenge_entitlementId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseDispute" DROP CONSTRAINT "PurchaseDispute_entitlementId_fkey";

-- DropForeignKey
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_paymentId_fkey";

-- DropIndex
DROP INDEX "CompletionOtpChallenge_entitlementId_idx";

-- DropIndex
DROP INDEX "CompletionOtpChallenge_expiresAt_idx";

-- DropIndex
DROP INDEX "PurchaseEntitlement_orderItemId_sequenceNo_key";

-- DropIndex
DROP INDEX "PurchaseEntitlement_vendorId_settlementStatus_idx";

-- DropIndex
DROP INDEX "PurchaseEntitlement_voucherCode_idx";

-- DropIndex
DROP INDEX "Refund_providerRefundId_key";

-- DropIndex
DROP INDEX "SettlementAdjustment_refundId_key";

-- AlterTable
ALTER TABLE "CompletionOtpChallenge" DROP COLUMN "purpose",
ADD COLUMN     "purpose" TEXT NOT NULL,
ALTER COLUMN "lastSentAt" DROP DEFAULT,
ALTER COLUMN "requestedByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FinanceSettings" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "productReturnHoldHours" SET DEFAULT 24,
ALTER COLUMN "completionOtpExpiryMinutes" SET DEFAULT 5,
ALTER COLUMN "completionOtpResendCooldownSeconds" SET DEFAULT 30;

-- AlterTable
ALTER TABLE "MemberPayout" DROP COLUMN "method",
DROP COLUMN "status",
ADD COLUMN     "status" "MemberPayoutStatus" NOT NULL DEFAULT 'PAID',
ALTER COLUMN "recordedByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseDispute" ALTER COLUMN "entitlementId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseEntitlement" DROP COLUMN "deliveryEvidenceNote",
DROP COLUMN "deliveryEvidenceStorageKey",
DROP COLUMN "recordedByUserId",
ADD COLUMN     "productId" TEXT,
DROP COLUMN "fulfilmentKind",
ADD COLUMN     "fulfilmentKind" "PurchaseEntitlementFulfilmentKind" NOT NULL,
ALTER COLUMN "commissionRatePercent" DROP NOT NULL,
DROP COLUMN "settlementStatus",
ADD COLUMN     "settlementStatus" "PurchaseEntitlementSettlementStatus" NOT NULL DEFAULT 'PENDING_FULFILMENT',
DROP COLUMN "preDisputeStatus",
ADD COLUMN     "preDisputeStatus" "PurchaseEntitlementSettlementStatus";

-- AlterTable
ALTER TABLE "Refund" ALTER COLUMN "paymentId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PROCESSED';

-- AlterTable
ALTER TABLE "SettlementAdjustment" ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roleConflict" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "CompletionOtpPurpose";

-- DropEnum
DROP TYPE "FulfilmentKind";

-- DropEnum
DROP TYPE "PayoutMethod";

-- DropEnum
DROP TYPE "PayoutStatus";

-- DropEnum
DROP TYPE "SettlementStatus";

-- CreateIndex
CREATE INDEX "CompletionOtpChallenge_entitlementId_verifiedAt_createdAt_idx" ON "CompletionOtpChallenge"("entitlementId", "verifiedAt", "createdAt");

-- CreateIndex
CREATE INDEX "MemberPayout_status_idx" ON "MemberPayout"("status");

-- CreateIndex
CREATE INDEX "MemberPayoutItem_entitlementId_idx" ON "MemberPayoutItem"("entitlementId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseEntitlement_payoutItemId_key" ON "PurchaseEntitlement"("payoutItemId");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_vendorId_idx" ON "PurchaseEntitlement"("vendorId");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_branchId_idx" ON "PurchaseEntitlement"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_productId_idx" ON "PurchaseEntitlement"("productId");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_settlementStatus_idx" ON "PurchaseEntitlement"("settlementStatus");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_entitlementStatus_idx" ON "PurchaseEntitlement"("entitlementStatus");

-- CreateIndex
CREATE INDEX "SettlementAdjustment_refundId_idx" ON "SettlementAdjustment"("refundId");

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAdjustment" ADD CONSTRAINT "SettlementAdjustment_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDispute" ADD CONSTRAINT "PurchaseDispute_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PurchaseEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
