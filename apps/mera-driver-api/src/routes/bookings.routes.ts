import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as bookingService from '../services/booking.service';
import { CreateBookingSchema, UpdateBookingSchema } from '../schemas/trips.schema';
import { requestMeta } from '../lib/requestMeta';
import { bookingOwnerScope } from '../lib/ownerScope';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('trips.bookings', 'view'), async (req, res, next) => {
  try {
    const filters=z.object({status:z.string().max(100).optional(),assignment:z.enum(['unassigned']).optional(),timing:z.enum(['today','upcoming']).optional(),payment:z.enum(['unpaid']).optional(),search:z.string().max(200).optional()}).parse(req.query);
    if(req.query.page!==undefined){
      const paging=z.object({page:z.coerce.number().int().min(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),sort:z.enum(['bookingCode','customerName','driverName','tripTypeName','status','paymentMode','paymentStatus','startsAt','finalFare','createdAt']).default('createdAt'),direction:z.enum(['asc','desc']).default('desc')}).parse(req.query);
      const result=await bookingService.searchBookings(req.query.view==='trips',await bookingOwnerScope(req),filters,paging.page,paging.pageSize,paging.sort,paging.direction);
      res.json({data:result.rows,error:null,meta:result.meta});return;
    }
    const rows = await bookingService.listBookings(req.query.view==='trips', await bookingOwnerScope(req), filters) as unknown[];
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
      const scope = await bookingOwnerScope(req);
      const row = await bookingService.createBooking(req.body, scope.mode === 'own' ? scope.ownerUserId : null);
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
      const row = await bookingService.updateBooking(req.params.id, req.body, await bookingOwnerScope(req));
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
    await bookingService.deleteBooking(req.params.id, await bookingOwnerScope(req));
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
