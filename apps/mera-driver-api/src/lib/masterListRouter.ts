import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import * as auditService from '../services/audit.service';
import * as masterListItemService from '../services/masterListItem.service';
import { CreateMasterListItemSchema, UpdateMasterListItemSchema } from '../schemas/masters.schema';
import { requestMeta } from './requestMeta';

/**
 * One router per simple lookup list (driver-types, education, eye-visions, health-docs,
 * personal-docs, police-docs, source-types, statuses) — same shape, same CRUD, only the
 * `category` (baked in here, never client-supplied) and the gating `menuKey` differ.
 * Mirrors `makeStubRouter(menuKey)` extended to real CRUD against `MasterListItem`.
 */
export function makeMasterListRouter(category: string, menuKey: string): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', requirePermission(menuKey, 'view'), async (_req, res, next) => {
    try {
      const rows = await masterListItemService.listMasterListItems(category);
      res.json({ data: rows, error: null, meta: { total: rows.length } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requirePermission(menuKey, 'create'), validateBody(CreateMasterListItemSchema), async (req, res, next) => {
    try {
      const row = await masterListItemService.createMasterListItem(category, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: `masterListItem.${category}.create`,
        targetType: 'MasterListItem',
        targetId: row.id,
        after: row,
        ...requestMeta(req),
      });
      res.status(201).json({ data: row, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requirePermission(menuKey, 'edit'), validateBody(UpdateMasterListItemSchema), async (req, res, next) => {
    try {
      const row = await masterListItemService.updateMasterListItem(category, req.params.id, req.body);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: `masterListItem.${category}.update`,
        targetType: 'MasterListItem',
        targetId: row.id,
        after: row,
        ...requestMeta(req),
      });
      res.json({ data: row, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requirePermission(menuKey, 'delete'), async (req, res, next) => {
    try {
      await masterListItemService.deleteMasterListItem(category, req.params.id);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: `masterListItem.${category}.delete`,
        targetType: 'MasterListItem',
        targetId: req.params.id,
        ...requestMeta(req),
      });
      res.json({ data: { id: req.params.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
