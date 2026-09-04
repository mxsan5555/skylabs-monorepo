import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { getDashboardStats } from '../services/dashboard.service';
import { sendData } from '../lib/http';

/**
 * Aggregate marketplace counts for the admin dashboard. Gated on the SAME `dashboard:view`
 * permission every role already holds for the Dashboard menu node itself (see
 * prisma/seed.ts's grantStarterPermissions) — no new Permission/menuKey introduced.
 */
const router = Router();
router.use(authenticate);

router.get('/stats', requirePermission('dashboard', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await getDashboardStats());
  } catch (err) {
    next(err);
  }
});

export default router;
