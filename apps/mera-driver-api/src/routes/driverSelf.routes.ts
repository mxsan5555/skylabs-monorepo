import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { resolveOwnDriver } from '../lib/resolveOwnDriver';
import { validateBody } from '../middleware/validate';
import { HttpError } from '../middleware/errorHandler';
import * as auditService from '../services/audit.service';
import * as driverService from '../services/driver.service';
import { UpdateOwnDriverSchema } from '../schemas/driverSelf.schema';
import { CreateDriverDocumentSchema } from '../schemas/business.schema';
import { requestMeta } from '../lib/requestMeta';
import { diskStorageFor } from '../lib/upload';

/**
 * The driver self-service surface, mounted at `/drivers/me`. Every route here resolves
 * `driverId` from `req.driver` (set by `resolveOwnDriver`, itself derived only from the
 * caller's `req.user.sub`) — never from a param/query/body — so there is no route shape
 * that could ever be pointed at another driver's record. Ownership is the authorization;
 * none of these routes use `requirePermission`.
 */
const router = Router();
const upload = multer({
  storage: diskStorageFor((req) => `drivers/${req.driver!.id}`),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(authenticate);
router.use(resolveOwnDriver);

router.get('/', async (req, res, next) => {
  try {
    const driver = await driverService.getDriverById(req.driver!.id);
    res.json({ data: driver, error: null });
  } catch (err) {
    next(err);
  }
});

// Manual-review KYC stays staff-only: `UpdateOwnDriverSchema` never accepts `status` or the
// police-verification fields, so there's nothing here that could self-verify a driver.
router.patch('/', validateBody(UpdateOwnDriverSchema), async (req, res, next) => {
  try {
    const driver = await driverService.updateDriver(req.driver!.id, req.body);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.self.update',
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

router.get('/documents', async (req, res, next) => {
  try {
    const docs = await driverService.listDriverDocuments(req.driver!.id);
    res.json({ data: docs, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/documents', upload.single('file'), async (req, res, next) => {
  try {
    const parsed = CreateDriverDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid document metadata', parsed.error.flatten());
    }
    const file = req.file;
    const doc = await driverService.addDriverDocument({
      driverId: req.driver!.id,
      category: parsed.data.category,
      type: parsed.data.type,
      regNo: parsed.data.regNo,
      fileName: file?.originalname,
      filePath: file ? `drivers/${req.driver!.id}/${file.filename}` : undefined,
      mimeType: file?.mimetype,
      sizeBytes: file?.size,
    });
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.self.document.upload',
      targetType: 'Driver',
      targetId: req.driver!.id,
      after: doc,
      ...requestMeta(req),
    });
    res.status(201).json({ data: doc, error: null });
  } catch (err) {
    next(err);
  }
});

// `deleteDriverDocument` re-checks `WHERE id = :docId AND driverId = req.driver.id` — a
// docId belonging to another driver 404s exactly like a nonexistent one, no existence leak.
router.delete('/documents/:docId', async (req, res, next) => {
  try {
    const doc = await driverService.deleteDriverDocument(req.driver!.id, req.params.docId);
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.self.document.delete',
      targetType: 'Driver',
      targetId: req.driver!.id,
      before: doc,
      ...requestMeta(req),
    });
    res.json({ data: { id: req.params.docId }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
