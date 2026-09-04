import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { sendData } from '../lib/http';

/**
 * Business domain modules (Customers, Vendors, Orders, Products, Inventory, Reports) are
 * out of scope for the RBAC build — this factory just proves `requirePermission(menuKey,
 * 'view')` gates a route end to end. Replace each with real CRUD when that module is built.
 */
export function createStubRouter(menuKey: string): Router {
  const router = Router();
  router.get('/', authenticate, requirePermission(menuKey, 'view'), (_req, res) => {
    sendData(res, []);
  });
  return router;
}
