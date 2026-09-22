import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as bookingService from '../services/booking.service';
import { CreateBookingSchema, UpdateBookingSchema } from '../schemas/trips.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('trips.bookings', 'view'), async (_req, res, next) => {
  try {
    const rows = await bookingService.listBookings();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('trips.bookings', 'create'),
  validateBody(CreateBookingSchema),
  async (req, res, next) => {
    try {
      const row = await bookingService.createBooking(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'booking.create',
        targetType: 'Booking',
        targetId: row.id,
        after: row,
        ...requestMeta(req),
      });
      res.status(201).json({ data: row, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requirePermission('trips.bookings', 'edit'),
  validateBody(UpdateBookingSchema),
  async (req, res, next) => {
    try {
      const row = await bookingService.updateBooking(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'booking.update',
        targetType: 'Booking',
        targetId: row.id,
        after: row,
        ...requestMeta(req),
      });
      res.json({ data: row, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('trips.bookings', 'delete'), async (req, res, next) => {
  try {
    await bookingService.deleteBooking(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'booking.delete',
      targetType: 'Booking',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
