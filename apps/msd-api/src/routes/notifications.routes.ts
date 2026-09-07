import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validateParams, validateQuery } from '../middleware/validate';
import { UuidParamSchema } from '../schemas/common.schema';
import { NotificationListQuerySchema } from '../schemas/notification.schema';
import * as notificationService from '../services/notification.service';
import { sendData } from '../lib/http';

/**
 * A caller's own notifications only — ownership-scoped via `req.user.sub`, same as `/orders/me`
 * or `/vendors/me/*`, never RBAC-scoped (no `requirePermission`): every authenticated console
 * user, Vendor or Superadmin alike, is entitled to see their own notification inbox regardless of
 * what permissions their role happens to hold.
 */
const router = Router();
router.use(authenticate);

router.get('/', validateQuery(NotificationListQuerySchema), async (req, res, next) => {
  try {
    const { page, pageSize } = req.validatedQuery as ReturnType<typeof NotificationListQuerySchema.parse>;
    const { items, total, unreadCount } = await notificationService.listNotificationsForUser(req.user!.sub, { page, pageSize });
    sendData(res, items, { meta: { total, page, pageSize, unreadCount } });
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await notificationService.markAllNotificationsRead(req.user!.sub);
    sendData(res, { updated: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', validateParams(UuidParamSchema), async (req, res, next) => {
  try {
    await notificationService.markNotificationRead(req.user!.sub, req.params.id);
    sendData(res, { updated: true });
  } catch (err) {
    next(err);
  }
});

export default router;
