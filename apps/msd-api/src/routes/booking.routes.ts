import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateBody, validateParams } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { BookingListQuerySchema, BookingCreateSchema, BookingCancelSchema } from '../schemas/booking.schema';
import * as bookingService from '../services/booking.service';
import { sendData } from '../lib/http';

/**
 * Customer service bookings — self-service only, gated on `authenticate` alone (no
 * `requirePermission`), same reasoning as `cart.routes.ts`. `customerId` is always
 * `req.user.sub` — never a param/body value.
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
