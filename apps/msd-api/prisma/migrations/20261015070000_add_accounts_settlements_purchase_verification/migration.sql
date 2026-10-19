-- Accounts, Member Settlements & Purchase Verification — net-new domain, additive-only.
-- Generated via `prisma migrate diff --from-url <dev db> --to-schema-datamodel schema.prisma
-- --script` (the normal `prisma migrate dev` path was blocked by pre-existing, unrelated drift
-- already present in this dev database before this change — several older migrations marked
-- "modified after applied" and one migration applied to the DB with no matching local file; none
-- of that drift was touched or resolved here, per "additive only, never destructive, never
-- reset"). Applied with `prisma db execute` then recorded with `prisma migrate resolve --applied`
-- so migration history stays accurate without running a destructive `migrate reset`.

-- CreateSequence — backs `voucherCode` generation (lib/voucher.ts#nextVoucherCode): a real
-- Postgres sequence gives true DB-guaranteed uniqueness with no collision-retry loop, and is
-- base36-encoded + item-type-prefixed (MSD-DL-/MSD-TH-/MSD-PR-) in application code, never
-- exposing the raw integer or any secret/customer data.
CREATE SEQUENCE IF NOT EXISTS "purchase_entitlement_voucher_seq" START WITH 100000 INCREMENT BY 1;

-- CreateEnum
CREATE TYPE "FulfilmentKind" AS ENUM ('SERVICE_SESSION', 'PRODUCT_PICKUP', 'PRODUCT_SHIPPED');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'STARTED', 'OTP_REQUESTED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING_FULFILMENT', 'ON_HOLD', 'DISPUTED_BLOCKED', 'PROCESSING', 'PAID', 'FAILED', 'VOID');

-- CreateEnum
CREATE TYPE "SettlementAdjustmentType" AS ENUM ('REFUND', 'MANUAL_ADJUSTMENT', 'RECOVERY');

-- CreateEnum
CREATE TYPE "CompletionOtpPurpose" AS ENUM ('SERVICE_COMPLETION', 'PRODUCT_PICKUP');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeResolutionType" AS ENUM ('NO_ACTION', 'REFUNDED', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('MANUAL_BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DISPUTE_RAISED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYOUT_RECORDED';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "commissionRatePercent" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "FinanceSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "defaultCommissionRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "serviceHoldHours" INTEGER NOT NULL DEFAULT 24,
    "productReturnHoldHours" INTEGER NOT NULL DEFAULT 168,
    "completionOtpExpiryMinutes" INTEGER NOT NULL DEFAULT 10,
    "completionOtpMaxAttempts" INTEGER NOT NULL DEFAULT 5,
    "completionOtpResendCooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseEntitlement" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "voucherCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "branchId" TEXT,
    "fulfilmentKind" "FulfilmentKind" NOT NULL,
    "entitlementStatus" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "serviceStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveryEvidenceStorageKey" TEXT,
    "deliveryEvidenceNote" TEXT,
    "recordedByUserId" TEXT,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "commissionRatePercent" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "memberShareAmount" DECIMAL(10,2) NOT NULL,
    "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'PENDING_FULFILMENT',
    "preDisputeStatus" "SettlementStatus",
    "holdUntil" TIMESTAMP(3),
    "payoutItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementAdjustment" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "type" "SettlementAdjustmentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "refundId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionOtpChallenge" (
    "id" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "purpose" "CompletionOtpPurpose" NOT NULL,
    "hashedOtp" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletionOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseDispute" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "entitlementId" TEXT,
    "customerId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "evidenceStorageKey" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNotes" TEXT,
    "resolutionType" "DisputeResolutionType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" "RefundType" NOT NULL,
    "reason" TEXT,
    "disputeId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerRefundId" TEXT,
    "processedByUserId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPayout" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PayoutMethod" NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "bankAccountHolderSnapshot" TEXT NOT NULL,
    "bankNameSnapshot" TEXT,
    "bankAccountNumberSnapshot" TEXT NOT NULL,
    "bankIfscSnapshot" TEXT NOT NULL,
    "upiIdSnapshot" TEXT,
    "reference" TEXT,
    "transferDate" TIMESTAMP(3),
    "proofStorageKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPayoutItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "entitlementId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberPayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseEntitlement_voucherCode_key" ON "PurchaseEntitlement"("voucherCode");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_vendorId_settlementStatus_idx" ON "PurchaseEntitlement"("vendorId", "settlementStatus");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_voucherCode_idx" ON "PurchaseEntitlement"("voucherCode");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_customerId_idx" ON "PurchaseEntitlement"("customerId");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_orderItemId_idx" ON "PurchaseEntitlement"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseEntitlement_orderItemId_sequenceNo_key" ON "PurchaseEntitlement"("orderItemId", "sequenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementAdjustment_refundId_key" ON "SettlementAdjustment"("refundId");

-- CreateIndex
CREATE INDEX "SettlementAdjustment_entitlementId_idx" ON "SettlementAdjustment"("entitlementId");

-- CreateIndex
CREATE INDEX "CompletionOtpChallenge_entitlementId_idx" ON "CompletionOtpChallenge"("entitlementId");

-- CreateIndex
CREATE INDEX "CompletionOtpChallenge_expiresAt_idx" ON "CompletionOtpChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "PurchaseDispute_orderItemId_idx" ON "PurchaseDispute"("orderItemId");

-- CreateIndex
CREATE INDEX "PurchaseDispute_entitlementId_idx" ON "PurchaseDispute"("entitlementId");

-- CreateIndex
CREATE INDEX "PurchaseDispute_customerId_idx" ON "PurchaseDispute"("customerId");

-- CreateIndex
CREATE INDEX "PurchaseDispute_status_idx" ON "PurchaseDispute"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");

-- CreateIndex
CREATE INDEX "Refund_orderItemId_idx" ON "Refund"("orderItemId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_disputeId_idx" ON "Refund"("disputeId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPayout_idempotencyKey_key" ON "MemberPayout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MemberPayout_vendorId_idx" ON "MemberPayout"("vendorId");

-- CreateIndex
CREATE INDEX "MemberPayout_status_idx" ON "MemberPayout"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPayoutItem_entitlementId_key" ON "MemberPayoutItem"("entitlementId");

-- CreateIndex
CREATE INDEX "MemberPayoutItem_payoutId_idx" ON "MemberPayoutItem"("payoutId");

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementAdjustment" ADD CONSTRAINT "SettlementAdjustment_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PurchaseEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionOtpChallenge" ADD CONSTRAINT "CompletionOtpChallenge_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PurchaseEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDispute" ADD CONSTRAINT "PurchaseDispute_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDispute" ADD CONSTRAINT "PurchaseDispute_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PurchaseEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseDispute" ADD CONSTRAINT "PurchaseDispute_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "PurchaseDispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPayout" ADD CONSTRAINT "MemberPayout_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPayoutItem" ADD CONSTRAINT "MemberPayoutItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "MemberPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPayoutItem" ADD CONSTRAINT "MemberPayoutItem_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PurchaseEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

