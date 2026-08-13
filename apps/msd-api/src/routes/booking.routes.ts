import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import {
  BookingListQuerySchema,
  BookingCreateSchema,
  BookingCancelSchema,
  BookingVendorStatusUpdateSchema,
} from '../schemas/booking.schema';
import * as bookingService from '../services/booking.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData } from '../lib/http';

/**
 * Customer service bookings — self-service only, gated on `authenticate` alone (no
 * `requirePermission`), same reasoning as `cart.routes.ts`. `customerId` is always
 * `req.user.sub` — never a param/body value.
 *
 * `/vendor*` (Phase 10) is the separate vendor/admin-facing surface, reusing the EXISTING
 * `orders` permission key (`orders:view`/`orders:status_change`) rather than inventing a
 * `bookings` permission — a Booking only ever exists to back a SERVICE Order, so "who may
 * manage orders" already covers "who may manage the bookings behind them". Mounted under
 * `/vendor` (not `/me`, which the customer routes already use) so neither surface collides.
 */
const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, status } = BookingListQuerySchema.parse(req.query);
    const { items, total } = await bookingService.listMyBookings(req.user!.sub, { page, pageSize, status });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(BookingCreateSchema), async (req, res, next) => {
  try {
    sendData(res, await bookingService.createBooking(req.user!.sub, req.body), { status: 201 });
  } catch (err) {
    next(err);
  }
});

// ─── Vendor / admin (Phase 10) — registered before `/:id` so the literal `/vendor` segment
// always wins the match; otherwise Express would treat "vendor" as an `:id` param value first. ──

router.get('/vendor', requirePermission('orders', 'view'), async (req, res, next) => {
  try {
    const { page, pageSize, status, vendorId } = BookingListQuerySchema.parse(req.query);
    const { items, total } = await bookingService.listVendorBookings(req.user!.sub, { page, pageSize, status, vendorId });
    sendData(res, items, { meta: { total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/vendor/:id', requirePermission('orders', 'view'), validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await bookingService.getVendorBookingOrThrow(req.user!.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/vendor/:id/status',
  requirePermission('orders', 'status_change'),
  validateParams(UuidParamSchema),
  validateBody(BookingVendorStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const booking = await bookingService.setVendorBookingStatus(req.user!.sub, req.params.id, req.body.status, req.body.cancellationReason);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'booking.status_change',
        targetType: 'Booking',
        targetId: booking.id,
        after: { status: booking.status },
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      sendData(res, booking);
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    sendData(res, await bookingService.getMyBookingOrThrow(req.user!.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  validateParams(UuidParamSchema),
  validateBody(BookingCancelSchema),
  async (req, res, next) => {
    try {
      sendData(res, await bookingService.cancelMyBooking(req.user!.sub, req.params.id, req.body.cancellationReason));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
