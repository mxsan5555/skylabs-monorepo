-- Combined checkout (Deal + Therapist + Product together: one checkout action, one payment,
-- multiple Order rows under the hood) needs ONE Razorpay order to fund several msd Orders at
-- once — several Payment rows legitimately sharing the same providerOrderId/providerPaymentId,
-- one per Order in the batch. Drop the old single-Order uniqueness, keep fast lookup via a
-- plain (non-unique) index instead — see Payment's own schema doc comment.
DROP INDEX "Payment_providerOrderId_key";
DROP INDEX "Payment_providerPaymentId_key";

CREATE INDEX "Payment_providerOrderId_idx" ON "Payment"("providerOrderId");
CREATE INDEX "Payment_providerPaymentId_idx" ON "Payment"("providerPaymentId");
