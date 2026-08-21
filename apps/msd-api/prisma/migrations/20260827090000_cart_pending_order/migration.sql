-- Cart.pendingOrderId — points at the Order created from this cart's items while checkout is
-- in flight but not yet paid. CartItem deletion moves from "at Order creation" (too eager — see
-- order.service.ts#createOrderFromCart's doc comment) to "at payment success" (finalizeCartForOrder
-- in payment.service.ts), matching how Booking.status already only transitions on payment
-- success. While set, a repeat checkout call reuses the existing Order instead of creating a
-- duplicate one.
ALTER TABLE "Cart" ADD COLUMN "pendingOrderId" TEXT;

CREATE UNIQUE INDEX "Cart_pendingOrderId_key" ON "Cart"("pendingOrderId");

ALTER TABLE "Cart" ADD CONSTRAINT "Cart_pendingOrderId_fkey"
  FOREIGN KEY ("pendingOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
