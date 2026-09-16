import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as attendanceService from '../services/attendance.service';
import { CreateAttendanceSchema, UpdateAttendanceSchema } from '../schemas/business.schema';
import { requestMeta } from '../lib/requestMeta';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('attendance', 'view'), async (_req, res, next) => {
  try {
    const rows = await attendanceService.listAttendance();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('attendance', 'create'),
  validateBody(CreateAttendanceSchema),
  async (req, res, next) => {
    try {
      const record = await attendanceService.createAttendance(req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'attendance.create',
        targetType: 'AttendanceRecord',
        targetId: record.id,
        after: record,
        ...requestMeta(req),
      });
      res.status(201).json({ data: record, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requirePermission('attendance', 'edit'),
  validateBody(UpdateAttendanceSchema),
  async (req, res, next) => {
    try {
      const record = await attendanceService.updateAttendance(req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'attendance.update',
        targetType: 'AttendanceRecord',
        targetId: record.id,
        after: record,
        ...requestMeta(req),
      });
      res.json({ data: record, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('attendance', 'delete'), async (req, res, next) => {
  try {
    await attendanceService.deleteAttendance(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'attendance.delete',
      targetType: 'AttendanceRecord',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
