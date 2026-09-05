import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';

/**
 * Business-domain modules (Drivers, Vehicles, Trips, Attendance, Payments, Reports,
 * Driver Masters) are out of scope for this build — this factory only proves the
 * `requirePermission(menuKey, 'view')` gate wires up end to end for each module's menu key.
 * Real CRUD replaces the single stub route per module later.
 */
export function makeStubRouter(menuKey: string): Router {
  const router = Router();
  router.get('/', authenticate, requirePermission(menuKey, 'view'), (_req, res) => {
    res.json({ data: [], error: null, meta: { total: 0 } });
  });
  return router;
}
