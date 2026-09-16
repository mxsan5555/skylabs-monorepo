import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../middleware/errorHandler';
import * as auditService from '../services/audit.service';
import * as driverService from '../services/driver.service';
import {
  CreateDriverSchema,
  UpdateDriverSchema,
  CreateDriverDocumentSchema,
  LinkDriverToUserSchema,
  SetDriverStatusSchema,
} from '../schemas/business.schema';
import { requestMeta } from '../lib/requestMeta';
import { diskStorageFor } from '../lib/upload';

const router = Router();
const upload = multer({ storage: diskStorageFor((req) => `drivers/${req.params.id}`), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.get('/', requirePermission('drivers', 'view'), async (_req, res, next) => {
  try {
    const rows = await driverService.listDrivers();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('drivers', 'create'), validateBody(CreateDriverSchema), async (req, res, next) => {
  try {
    const driver = await driverService.createDriver(req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.create',
      targetType: 'Driver',
      targetId: driver.id,
      after: driver,
      ...requestMeta(req),
    });
    res.status(201).json({ data: driver, error: null });
  } catch (err) {
    next(err);
  }
});

// Manual-review KYC: `status` only ever changes here, by whoever holds `drivers:edit` —
// no automatic verification logic and no third-party call sets this field.
router.patch('/:id', requirePermission('drivers', 'edit'), validateBody(UpdateDriverSchema), async (req, res, next) => {
  try {
    const driver = await driverService.updateDriver(req.params.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.update',
      targetType: 'Driver',
      targetId: driver.id,
      after: driver,
      ...requestMeta(req),
    });
    res.json({ data: driver, error: null });
  } catch (err) {
    next(err);
  }
});

// Account status (Active/Inactive) — the portal login gate, independent of the KYC `status`
// changed by the route above. Enforced server-side at login and on every /drivers/me* call,
// not just this admin-console toggle — see `assertDriverAccountActive`/`resolveOwnDriver`.
router.patch(
  '/:id/status',
  requirePermission('drivers', 'status_change'),
  validateBody(SetDriverStatusSchema),
  async (req, res, next) => {
    try {
      const driver = await driverService.setDriverAccountStatus(req.params.id, req.body.accountStatus);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'driver.status_change',
        targetType: 'Driver',
        targetId: driver.id,
        after: { accountStatus: req.body.accountStatus },
        ...requestMeta(req),
      });
      res.json({ data: driver, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requirePermission('drivers', 'delete'), async (req, res, next) => {
  try {
    await driverService.deleteDriver(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.delete',
      targetType: 'Driver',
      targetId: req.params.id,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.id }, error: null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// KYC documents — local disk storage, metadata only (no verification call).
// ---------------------------------------------------------------------------

router.get('/:id/documents', requirePermission('drivers', 'view'), async (req, res, next) => {
  try {
    const docs = await driverService.listDriverDocuments(req.params.id);
    res.json({ data: docs, error: null });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/documents',
  requirePermission('drivers', 'edit'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const parsed = CreateDriverDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid document metadata', parsed.error.flatten());
      }
      const file = req.file;
      const doc = await driverService.addDriverDocument({
        driverId: req.params.id,
        category: parsed.data.category,
        type: parsed.data.type,
        regNo: parsed.data.regNo,
        fileName: file?.originalname,
        filePath: file ? `drivers/${req.params.id}/${file.filename}` : undefined,
        mimeType: file?.mimetype,
        sizeBytes: file?.size,
      });
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'driver.document.upload',
        targetType: 'Driver',
        targetId: req.params.id,
        after: doc,
        ...requestMeta(req),
      });
      res.status(201).json({ data: doc, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id/documents/:docId', requirePermission('drivers', 'edit'), async (req, res, next) => {
  try {
    const doc = await driverService.deleteDriverDocument(req.params.id, req.params.docId);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.document.delete',
      targetType: 'Driver',
      targetId: req.params.id,
      before: doc,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.docId }, error: null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Driver <-> User linkage (grants/revokes self-service portal access).
// ---------------------------------------------------------------------------

router.patch(
  '/:id/link-user',
  requirePermission('drivers', 'assign'),
  validateBody(LinkDriverToUserSchema),
  async (req, res, next) => {
    try {
      const driver = await driverService.linkDriverToUser(req.params.id, req.body.userId);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'driver.link',
        targetType: 'Driver',
        targetId: driver.id,
        after: { userId: req.body.userId },
        ...requestMeta(req),
      });
      res.json({ data: driver, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.patch('/:id/unlink-user', requirePermission('drivers', 'assign'), async (req, res, next) => {
  try {
    const driver = await driverService.unlinkDriverFromUser(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.unlink',
      targetType: 'Driver',
      targetId: driver.id,
      ...requestMeta(req),
    });
    res.json({ data: driver, error: null });
  } catch (err) {
    next(err);
  }
});

// One-click Driver User creation: creates the User, assigns the `driver` role, and links
// it, all server-side — no existing-user picker. This is the only path that grants a
// driver a portal login; see `createAndLinkDriverUser`.
router.post('/:id/create-user', requirePermission('drivers', 'assign'), async (req, res, next) => {
  try {
    const driver = await driverService.createAndLinkDriverUser(req.params.id);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.user.create',
      targetType: 'Driver',
      targetId: driver.id,
      after: { userId: driver.userId },
      ...requestMeta(req),
    });
    res.status(201).json({ data: driver, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
