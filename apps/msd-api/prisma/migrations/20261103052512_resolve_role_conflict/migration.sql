/*
  Warnings:

  - The values [COMMISSION,BONUS,OTHER] on the enum `SettlementAdjustmentType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `createdAt` on the `FinanceSettings` table. All the data in the column will be lost.
  - The `status` column on the `MemberPayout` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `productId` on the `PurchaseEntitlement` table. All the data in the column will be lost.
  - The `settlementStatus` column on the `PurchaseEntitlement` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `preDisputeStatus` column on the `PurchaseEntitlement` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[orderItemId,sequenceNo]` on the table `PurchaseEntitlement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[providerRefundId]` on the table `Refund` will be added. If there are existing duplicate values, this will fail.
  - Made the column `requestedByUserId` on table `CompletionOtpChallenge` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `purpose` on the `CompletionOtpChallenge` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `recordedByUserId` on table `MemberPayout` required. This step will fail if there are existing NULL values in that column.
  - Made the column `commissionRatePercent` on table `PurchaseEntitlement` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `fulfilmentKind` on the `PurchaseEntitlement` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `paymentId` on table `Refund` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdByUserId` on table `SettlementAdjustment` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "FulfilmentKind" AS ENUM ('SERVICE_SESSION', 'PRODUCT_PICKUP', 'PRODUCT_SHIPPED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING_FULFILMENT', 'ON_HOLD', 'DISPUTED_BLOCKED', 'PROCESSING', 'PAID', 'FAILED', 'VOID');

-- CreateEnum
CREATE TYPE "CompletionOtpPurpose" AS ENUM ('SERVICE_COMPLETION', 'PRODUCT_PICKUP');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('MANUAL_BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- AlterEnum
ALTER TYPE "RefundStatus" ADD VALUE 'REQUESTED';

-- AlterEnum
BEGIN;
CREATE TYPE "SettlementAdjustmentType_new" AS ENUM ('REFUND', 'MANUAL_ADJUSTMENT', 'RECOVERY');
ALTER TABLE "SettlementAdjustment" ALTER COLUMN "type" TYPE "SettlementAdjustmentType_new" USING ("type"::text::"SettlementAdjustmentType_new");
ALTER TYPE "SettlementAdjustmentType" RENAME TO "SettlementAdjustmentType_old";
ALTER TYPE "SettlementAdjustmentType_new" RENAME TO "SettlementAdjustmentType";
DROP TYPE "public"."SettlementAdjustmentType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "PurchaseDispute" DROP CONSTRAINT "PurchaseDispute_entitlementId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseEntitlement" DROP CONSTRAINT "PurchaseEntitlement_productId_fkey";

-- DropForeignKey
ALTER TABLE "Refund" DROP CONSTRAINT "Refund_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "SettlementAdjustment" DROP CONSTRAINT "SettlementAdjustment_refundId_fkey";

-- DropIndex
DROP INDEX "CompletionOtpChallenge_entitlementId_verifiedAt_createdAt_idx";

-- DropIndex
DROP INDEX "MemberPayoutItem_entitlementId_idx";

-- DropIndex
DROP INDEX "PurchaseEntitlement_branchId_idx";

-- DropIndex
DROP INDEX "PurchaseEntitlement_entitlementStatus_idx";

-- DropIndex
DROP INDEX "PurchaseEntitlement_payoutItemId_key";

-- DropIndex
DROP INDEX "PurchaseEntitlement_productId_idx";

-- DropIndex
DROP INDEX "PurchaseEntitlement_settlementStatus_idx";

-- DropIndex
DROP INDEX "PurchaseEntitlement_vendorId_idx";

-- DropIndex
DROP INDEX "SettlementAdjustment_refundId_idx";

-- AlterTable
ALTER TABLE "CompletionOtpChallenge" ALTER COLUMN "lastSentAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "requestedByUserId" SET NOT NULL,
DROP COLUMN "purpose",
ADD COLUMN     "purpose" "CompletionOtpPurpose" NOT NULL;

-- AlterTable
ALTER TABLE "FinanceSettings" DROP COLUMN "createdAt",
ALTER COLUMN "id" SET DEFAULT 'singleton',
ALTER COLUMN "productReturnHoldHours" SET DEFAULT 168,
ALTER COLUMN "completionOtpExpiryMinutes" SET DEFAULT 10,
ALTER COLUMN "completionOtpResendCooldownSeconds" SET DEFAULT 60;

-- AlterTable
ALTER TABLE "MemberPayout" ADD COLUMN     "method" "PayoutMethod" NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
ALTER COLUMN "recordedByUserId" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "PurchaseDispute" ALTER COLUMN "entitlementId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseEntitlement" DROP COLUMN "productId",
ADD COLUMN     "deliveryEvidenceNote" TEXT,
ADD COLUMN     "deliveryEvidenceStorageKey" TEXT,
ADD COLUMN     "recordedByUserId" TEXT,
ALTER COLUMN "commissionRatePercent" SET NOT NULL,
DROP COLUMN "fulfilmentKind",
ADD COLUMN     "fulfilmentKind" "FulfilmentKind" NOT NULL,
DROP COLUMN "settlementStatus",
ADD COLUMN     "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'PENDING_FULFILMENT',
DROP COLUMN "preDisputeStatus",
ADD COLUMN     "preDisputeStatus" "SettlementStatus";

-- AlterTable
ALTER TABLE "Refund" ALTER COLUMN "paymentId" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'REQUESTED';

-- AlterTable
ALTER TABLE "SettlementAdjustment" ALTER COLUMN "createdByUserId" SET NOT NULL;

-- DropEnum
DROP TYPE "MemberPayoutStatus";

-- DropEnum
DROP TYPE "PurchaseEntitlementFulfilmentKind";

-- DropEnum
DROP TYPE "PurchaseEntitlementSettlementStatus";

-- CreateIndex
CREATE INDEX "CompletionOtpChallenge_entitlementId_idx" ON "CompletionOtpChallenge"("entitlementId");

-- CreateIndex
CREATE INDEX "MemberPayout_status_idx" ON "MemberPayout"("status");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_vendorId_settlementStatus_idx" ON "PurchaseEntitlement"("vendorId", "settlementStatus");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_voucherCode_idx" ON "PurchaseEntitlement"("voucherCode");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseEntitlement_orderItemId_sequenceNo_key" ON "PurchaseEntitlement"("orderItemId", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");

-- AddForeignKey
ALTER TABLE "CompletionOtpChallenge" ADD CONSTRAINT "CompletionOtpChallenge_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PurchaseEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDispute" ADD CONSTRAINT "PurchaseDispute_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PurchaseEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
