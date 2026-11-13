import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { PaginationQuerySchema, PincodeSchema } from './common.schema';
import { isIndiaLocation } from '@skylabs-monorepo/shared-utils';

extendZodWithOpenApi(z);

/**
 * Checkout's "Customer Details" step — collected once, before payment. Every field is optional
 * at the schema level (pre-existing `/checkout` callers send none at all, and that must keep
 * working) — the frontend enforces "required before payment" as UX. The backend's
 * job is only to reject a malformed value if one IS sent, never to silently persist garbage.
 */
export const OrderContactDetailsSchema = z.object({
  contactName: z.string().trim().min(1).max(200).optional(),
  contactPhone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Mobile number must be a valid 10-digit Indian number')
    .optional(),
  contactEmail: z.string().email('Enter a valid email address').optional(),
  shippingAddress: z.string().trim().min(1).max(500).optional(),
  shippingCity: z.string().trim().min(1).max(100).optional(),
  shippingState: z.string().trim().min(1).max(100).optional(),
  shippingPincode: PincodeSchema.optional(),
});

/** Checkout body: the delivery state and city, when both are given, come from the India list
 *  (item 2.2), the same list the checkout dropdowns use. */
export const OrderDeliveryDetailsSchema = OrderContactDetailsSchema.refine(
  (d) => !d.shippingState || !d.shippingCity || isIndiaLocation(d.shippingState, d.shippingCity),
  { message: 'Pick the city from the list for the chosen state.', path: ['shippingCity'] },
);

export const OrderCheckoutSchema = OrderDeliveryDetailsSchema.openapi('OrderCheckout');

/** Customer self-service may only ever cancel — confirm/complete is admin-only (existing
 *  `orders:status_change`). */
export const OrderCustomerCancelSchema = z
  .object({
    status: z.literal('CANCELLED'),
    cancellationReason: z.string().max(500).optional(),
  })
  .openapi('OrderCustomerCancel');

export const OrderStatusUpdateSchema = z
  .object({
    status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']),
    cancellationReason: z.string().max(500).optional(),
  })
  .openapi('OrderStatusUpdate');

export const OrderListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  /** Admin-only drill-in filter — ignored for a caller who owns a Vendor profile, whose results
   *  are always force-scoped to their own vendorId regardless of this param. */
  vendorId: z.string().uuid().optional(),
  /** A vendor may narrow to one of its own branches; admin may filter any branch. */
  branchId: z.string().uuid().optional(),
  /** Admin-only drill-in filter (Customer Detail's Orders tab) — a vendor caller stays
   *  force-scoped to its own vendorId regardless, same rule as `vendorId` above. */
  customerId: z.string().uuid().optional(),
  /** "Customer's Other Orders" (Order Details' Customer card) — excludes the one order being
   *  viewed from an otherwise-identical `customerId`-filtered list, so "other" is literal. */
  excludeOrderId: z.string().uuid().optional(),
  /** Matches orders with at least one payment attempt in this state — Order has no single
   *  "payment status" column of its own (Order 1 -> Payment[], see the Phase 9 architecture
   *  plan), so this is necessarily "has a payment attempt with this status", not "the current
   *  payment status" (which the Order.status itself already encodes for the confirmed/paid case). */
  paymentStatus: z.enum(['CREATED', 'PAID', 'FAILED', 'CANCELLED']).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  /** Free-text search across customer name/phone, the checkout-time `contactPhone` snapshot,
   *  vendor/branch name snapshot, and item names. */
  search: z.string().max(200).optional(),
});

/** Same filters as `OrderListQuerySchema`, minus `page`/`pageSize`/`status`/`paymentStatus` —
 *  `GET /orders/counts` always returns all three summary counts in one call (see
 *  `order.service.ts#getOrderCounts`'s own doc comment for why status/paymentStatus are never
 *  taken as filters here). */
export const OrderCountsQuerySchema = OrderListQuerySchema.omit({
  page: true,
  pageSize: true,
  status: true,
  paymentStatus: true,
});
