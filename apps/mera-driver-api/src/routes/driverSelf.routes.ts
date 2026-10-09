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
import { getPillReview } from '../services/driver-pill.service';
import { saveOwnPill } from '../services/driver-onboarding.service';
import { z } from 'zod';
import { driverResumePdf, getDriverResume, resumeContentDisposition } from '../services/driver-resume.service';
import { dlReviewState, dlVerificationPreflight } from '../services/driver-dl.service';
import { publicRateLimit } from '../middleware/publicRateLimit';

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
router.get('/resume',async(req,res,next)=>{try{res.setHeader('Cache-Control','private, no-store');res.json({data:await getDriverResume(req.driver!.id),error:null});}catch(error){next(error);}});
router.get('/resume.pdf',async(req,res,next)=>{try{const revision=z.string().length(64).optional().parse(req.query.revision);const resume=await getDriverResume(req.driver!.id);const pdf=await driverResumePdf(req.driver!.id,revision);res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Disposition',resumeContentDisposition(resume.filename));res.type('application/pdf').send(pdf);}catch(error){next(error);}});

router.get('/dl-verification',async(req,res,next)=>{try{res.setHeader('Cache-Control','private, no-store');res.json({data:await dlReviewState(req.driver!.id,await driverService.getDriverById(req.driver!.id)),error:null});}catch(error){next(error);}});
router.post('/dl-verification',(_req,_res,next)=>next(new HttpError(403,'DL_REVIEW_REQUIRED','Only the assigned KYC reviewer or explicitly authorized administrator can verify a saved licence')));

// Live location: the driver's own device pushes its position while online — bounded against
// runaway client polling (a buggy/compromised client spamming this is still ownership-scoped
// to its own driver row, but there's no reason to accept more than one update every few
// seconds). Never trusted as "live" without the server-stamped `locationUpdatedAt`.
router.patch('/location', publicRateLimit(20, 60000), validateBody(z.object({
  lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
}).strict()), async (req, res, next) => {
  try {
    const driver = await driverService.updateOwnLocation(req.driver!.id, req.body.lat, req.body.lng);
    res.json({ data: { lat: driver.currentLat, lng: driver.currentLng, updatedAt: driver.locationUpdatedAt }, error: null });
  } catch (error) { next(error); }
});

router.patch('/pill', validateBody(z.object({
  tab: z.number().int().min(1).max(4), pill: z.number().int().min(0).max(3),
  complete: z.boolean(), fields: z.record(z.string(), z.unknown()),
}).strict()), async (req, res, next) => {
  try {
    const before = await driverService.getDriverById(req.driver!.id);
    const driver = await saveOwnPill(req.driver!.id, req.body);
    await auditService.writeAuditLog({ actorUserId: req.user!.sub, action: 'driver.self.pill.save', targetType: 'Driver', targetId: driver.id,
      before, after: { tab: req.body.tab, pill: req.body.pill, complete: req.body.complete, submission: driver }, ...requestMeta(req) });
    res.json({ data: driver, error: null });
  } catch (error) { next(error); }
});

router.get('/pill-review', async (req, res, next) => {
  try { res.json({ data: await getPillReview(req.driver!.id), error: null }); } catch (error) { next(error); }
});

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
        typeKey: parsed.data.typeKey,
        replaceDocumentId: parsed.data.replaceDocumentId,
      regNo: parsed.data.regNo,
      expiresAt: parsed.data.expiresAt,
      fileName: file?.originalname,
      filePath: file ? `drivers/${req.driver!.id}/${file.filename}` : undefined,
      mimeType: file?.mimetype,
      sizeBytes: file?.size,
    }, {actorUserId:req.user!.sub,action:'driver.self.document.upload',...requestMeta(req)});

    res.status(201).json({ data: doc, error: null });
  } catch (err) {
    next(err);
  }
});

// `deleteDriverDocument` re-checks `WHERE id = :docId AND driverId = req.driver.id` — a
// docId belonging to another driver 404s exactly like a nonexistent one, no existence leak.
router.delete('/documents/:docId', async (req, res, next) => {
  try {
    const doc = await driverService.deleteDriverDocument(req.driver!.id, req.params.docId, {actorUserId:req.user!.sub,action:'driver.self.document.delete',...requestMeta(req)});
    res.json({ data: { id: req.params.docId }, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
