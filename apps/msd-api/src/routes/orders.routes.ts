import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  OrderCheckoutSchema,
  OrderFromBookingSchema,
  OrderCustomerCancelSchema,
  OrderStatusUpdateSchema,
  OrderListQuerySchema,
} from '../schemas/order.schema';
import { VerifyPaymentSchema } from '../schemas/payment.schema';
import * as orderService from '../services/order.service';
import * as paymentService from '../services/payment.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Orders — the Cart/Booking convergence point (Phase 8). Two access surfaces on one router:
 * `/orders/checkout`, `/orders/from-booking`, `/orders/me*` are customer self-service
 * (`authenticate` only, no RBAC — mirrors `cart.routes.ts`/`booking.routes.ts` exactly).
 * `/orders` (list/get) and `/orders/:id/status` reuse the EXISTING `orders` permission key —
 * `orders:view` (already granted to admin/vendor/sales) and `orders:status_change` (admin only)
 * — no new permission was needed or added.
 */
const router = Router();
router.use(authenticate);

function requestMeta(req: import('express').Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

// ─── Customer self-service ────────────────────────────────────────────────────

router.post('/checkout', validateBody(OrderCheckoutSchema), async (req, res, next) => {
  try {
    const order = await orderService.createOrderFromCart(req.user!.sub, req.body);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'order.create_from_cart',
      targetType: 'Order',
      targetId: order.id,
      after: order,
      ...requestMeta(req),
    });
    sendData(res, order, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.post('/from-booking', validateBody(OrderFromBookingSchema), async (req, res, next) => {
  try {
    const { bookingId, ...contactDetails } = req.body;
    const order = await orderService.createOrderFromBooking(req.user!.sub, bookingId, contactDetails);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'order.create_from_booking',
      targetType: 'Order',
      targetId: order.id,
      after: order,
      ...requestMeta(req),
    });
    sendData(res, order, { status: 201 });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const { page, pageSize, status } = OrderListQuerySchema.parse(req.query);
    const { items, total } = await orderService.listMyOrders(req.user!.sub, { page, pageSize, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/me/:id', validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await orderService.getMyOrderOrThrow(req.user!.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/me/:id/status',
  validateParams(UuidParamSchema),
  validateBody(OrderCustomerCancelSchema),
  async (req, res, next) => {
    try {
      const order = await orderService.cancelMyOrder(req.user!.sub, req.params.id, req.body.cancellationReason);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'order.self_cancel',
        targetType: 'Order',
        targetId: order.id,
        after: { status: order.status },
        ...requestMeta(req),
      });
      sendData(res, order);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/me/:id/pay', validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await paymentService.createOrReusePayment(req.user!.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/me/:id/pay-cod', validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    const { order } = await paymentService.createCodPayment(req.user!.sub, req.params.id);
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'payment.cod_confirmed',
      targetType: 'Order',
      targetId: order.id,
      after: { status: order.status },
      ...requestMeta(req),
    });
    sendData(res, order);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/me/:id/verify-payment',
  validateParams(UuidParamSchema),
  validateBody(VerifyPaymentSchema),
  async (req, res, next) => {
    try {
      const { order } = await paymentService.verifyPayment(req.user!.sub, req.params.id, req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'payment.verified',
        targetType: 'Order',
        targetId: order.id,
        after: { status: order.status },
        ...requestMeta(req),
      });
      sendData(res, order);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Admin / vendor-scoped (existing `orders` permission) ────────────────────

router.get('/', requirePermission('orders', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, status, vendorId, branchId, customerId, paymentStatus, createdFrom, createdTo, search } = OrderListQuerySchema.parse(req.query);
    const { items, total } = await orderService.listOrders(req.user!.sub, {
      page,
      pageSize,
      status,
      vendorId,
      branchId,
      customerId,
      paymentStatus,
      createdFrom,
      createdTo,
      search,
    });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requirePermission('orders', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await orderService.getOrderOrThrow(req.user!.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  requirePermission('orders', 'status_change'),
  validateParams(UuidParamSchema),
  validateBody(OrderStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const order = await orderService.setOrderStatus(req.user!.sub, req.params.id, req.body.status, req.body.cancellationReason);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'order.status_change',
        targetType: 'Order',
        targetId: order.id,
        after: { status: order.status },
        ...requestMeta(req),
      });
      sendData(res, order);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
