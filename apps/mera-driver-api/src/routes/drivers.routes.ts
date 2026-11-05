import { DriverApplicationSchema, driverApplicationOptions, submitDriverApplication } from '../services/driver-application.service';
import { publicRateLimit } from '../middleware/publicRateLimit';
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
  AssignVerifierSchema,
  KycChecklistSchema,
} from '../schemas/business.schema';
import { requestMeta } from '../lib/requestMeta';
import { prisma } from '../lib/prisma';
import { diskStorageFor } from '../lib/upload';
import { searchDrivers } from '../services/driver-list.service';
import { z } from 'zod';
import {resolveEffectivePermissionsForUser} from '../services/permission.service';
async function administrativeQueue(req:import('express').Request){return (await resolveEffectivePermissionsForUser(req.user!.sub,req.user!.roles)).includes('drivers:assign') && await driverOwnerScope(req) === null;}
import { getPillReview, savePillCheck } from '../services/driver-pill.service';
import { driverReportHtml } from '../services/driver-report.service';
import { driverDetails } from '../services/driver-details.service';
import { driverResumePdf, getDriverResume, updateDriverResume, resumeContentDisposition } from '../services/driver-resume.service';
import { UpdateResumeSchema } from '../schemas/driver-resume.schema';
import { driverPdf } from '../services/driver-pdf.service';
import { dlVerificationPreflight, dlReviewState } from '../services/driver-dl.service';
import { driverOwnerScope } from '../lib/ownerScope';
import { requireDriverOwnership } from '../middleware/requireDriverOwnership';

const router = Router();
const upload = multer({ storage: diskStorageFor((req) => `drivers/${req.params.id}`), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/application-options',publicRateLimit(30),async(_req,res,next)=>{try{res.json({data:await driverApplicationOptions(),error:null});}catch(error){next(error);}});
router.post('/applications',publicRateLimit(),validateBody(DriverApplicationSchema),async(req,res,next)=>{try{res.status(201).json({data:await submitDriverApplication(req.body),error:null});}catch(error){next(error);}});
router.use(authenticate);
router.get('/:id/dl-verification',requirePermission('drivers','view'),requireDriverOwnership,async(req,res,next)=>{try{const driver=await driverService.getDriverById(req.params.id);res.setHeader('Cache-Control','private, no-store');res.json({data:await dlReviewState(driver.id,driver),error:null});}catch(error){next(error);}});
router.post('/:id/dl-verification',requirePermission('drivers','edit'),(_req,_res,next)=>next(new HttpError(403,'DL_REVIEW_REQUIRED','Use the assigned KYC review to verify the saved licence')));
router.post('/:id/dl-verification/preflight',requirePermission('kyc-assignments','edit'),publicRateLimit(10),validateBody(z.object({retry:z.boolean().default(false)}).strict()),async(req,res,next)=>{try{const administrative=await administrativeQueue(req);await dlVerificationPreflight(req.params.id,req.user!.sub,req.body.retry,{administrative});res.json({data:await getPillReview(req.params.id,administrative?undefined:req.user!.sub),error:null});}catch(error){next(error);}});

router.get('/assigned-to-me/:id/pill-review', requirePermission('kyc-assignments', 'view'), async (req, res, next) => {
  try { res.json({ data: await getPillReview(req.params.id,await administrativeQueue(req)?undefined:req.user!.sub), error: null }); } catch (error) { next(error); }
});
router.patch('/:id/pill-review', requirePermission('kyc-assignments', 'edit'), validateBody(z.object({
  key: z.string().min(1), status: z.enum(['Pass', 'Issue']), reason: z.string().max(2000).optional(), hash: z.string().length(64),
})), async (req, res, next) => {
  try { res.json({ data: await savePillCheck(req.params.id, req.user!.sub, req.body), error: null }); } catch (error) { next(error); }
});

router.get('/eligible-verifiers', requirePermission('drivers', 'assign'), async (_req, res, next) => {
  try { res.json({data: await driverService.eligibleVerifiers(), error:null}); } catch (error) { next(error); }
});
router.get('/:id/assignment', requirePermission('drivers', 'assign'), requireDriverOwnership, async (req, res, next) => {
  try { res.setHeader('Cache-Control','private, no-store'); const driver=await driverService.getDriverById(req.params.id);res.json({data:{id:driver.id,firstName:driver.firstName,lastName:driver.lastName,phone:driver.phone,assignedVerifierId:driver.assignedVerifierId,assignedVerifier:driver.assignedVerifier,documents:[]},error:null}); } catch (error) { next(error); }
});

router.get('/search', requirePermission('drivers', 'view'), async (req, res, next) => {
  try {
    const result = await searchDrivers(req.query, { ownerUserId: await driverOwnerScope(req) });
    res.json({ data: result.rows, error: null, meta: result.meta });
  } catch (error) { next(error); }
});

router.get('/:id/details', requirePermission('drivers', 'view'), requireDriverOwnership, async (req,res,next)=>{try{res.setHeader('Cache-Control','private, no-store');res.json({data:await driverDetails(req.params.id),error:null});}catch(error){next(error);}});
router.post('/:id/kyc-approval', requirePermission('drivers','edit'), requirePermission('drivers','assign'), requireDriverOwnership, validateBody(z.object({}).strict()), async(req,res,next)=>{
  try {
    const driver=await driverService.updateDriver(req.params.id,{status:'Verified'},{explicitApproval:true});
    await auditService.writeAuditLog({actorUserId:req.user!.sub,action:'driver.kyc.final_approval',targetType:'Driver',targetId:driver.id,after:{status:driver.status},...requestMeta(req)});
    res.json({data:driver,error:null});
  }catch(error){next(error);}
});
router.get('/:id/resume', requirePermission('drivers', 'view'), requireDriverOwnership, async (req,res,next)=>{try{res.setHeader('Cache-Control','private, no-store');res.json({data:await getDriverResume(req.params.id),error:null});}catch(error){next(error);}});
router.patch('/:id/resume', requirePermission('drivers', 'edit'), requireDriverOwnership, validateBody(UpdateResumeSchema), async(req,res,next)=>{try{res.setHeader('Cache-Control','private, no-store');res.json({data:await updateDriverResume(req.params.id,req.user!.sub,req.body.profile,req.body.revision,req.body.reason),error:null});}catch(error){next(error);}});
router.get('/:id/resume.pdf', requirePermission('drivers', 'export'), requireDriverOwnership, async (req,res,next)=>{try{const revision=z.string().length(64).optional().parse(req.query.revision);const resume=await getDriverResume(req.params.id);const pdf=await driverResumePdf(req.params.id,revision);res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Disposition',resumeContentDisposition(resume.filename));res.type('application/pdf').send(pdf);}catch(error){next(error);}});

router.get('/:id/profile.pdf', requirePermission('drivers', 'export'), requireDriverOwnership, async (req, res, next) => {
  try {
    const pdf = await driverPdf(req.params.id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `attachment; filename="driver-${req.params.id.replace(/[^a-zA-Z0-9-]/g, '')}.pdf"`);
    res.type('application/pdf').send(pdf);
  } catch (error) { next(error); }
});

router.get('/:id/profile-report', requirePermission('drivers', 'export'), requireDriverOwnership, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('html').send(await driverReportHtml(req.params.id));
  } catch (error) { next(error); }
});

router.get('/:id/pill-review', requirePermission('drivers', 'view'), requireDriverOwnership, async (req, res, next) => {
  try { res.json({ data: await getPillReview(req.params.id), error: null }); } catch (error) { next(error); }
});

// Retained legacy list contract; use the same bounded query as /search.
router.get('/',requirePermission('drivers','view'),async(req,res,next)=>{try{const result=await searchDrivers(req.query, { ownerUserId: await driverOwnerScope(req) });res.json({data:result.rows,error:null,meta:result.meta});}catch(error){next(error);}});

// Customer-facing booking prerequisite — a safe, minimal driver projection (never
// email/phone/bank/documents). See `driver.service.ts`'s `listAvailableDrivers`.
router.get('/available', requirePermission('trips.bookings', 'view'), async (_req, res, next) => {
  try {
    const rows = await driverService.listAvailableDrivers();
    res.json({ data: rows, error: null, meta: { total: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission('drivers', 'create'), validateBody(CreateDriverSchema), async (req, res, next) => {
  try {
    const ownerUserId=await driverOwnerScope(req),requestId=req.get('Idempotency-Key');
    if(requestId&&!z.string().uuid().safeParse(requestId).success)throw new HttpError(422,'IDEMPOTENCY_KEY_INVALID','Use a UUID Idempotency-Key for a new Driver save');
    if(requestId){const existing=await prisma.driver.findUnique({where:{creationRequestId:requestId},select:{id:true,createdByUserId:true}});if(existing&&(!ownerUserId||existing.createdByUserId===ownerUserId)){res.status(200).json({data:await driverService.getDriverById(existing.id),error:null});return;}}
    const driver = await driverService.createDriver({...req.body,...(requestId?{creationRequestId:requestId}:{})}, {actorId:req.user!.sub,canChangeStatus:req.body.driverStatusMasterId === undefined ? false : (await resolveEffectivePermissionsForUser(req.user!.sub,req.user!.roles)).includes('drivers:status_change'),ownerUserId});
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
    const requestId=req.get('Idempotency-Key');
    if(requestId&&(err as {code?:string})?.code==='P2002')try{const ownerUserId=await driverOwnerScope(req),existing=await prisma.driver.findUnique({where:{creationRequestId:requestId},select:{id:true,createdByUserId:true}});if(existing&&(!ownerUserId||existing.createdByUserId===ownerUserId)){res.status(200).json({data:await driverService.getDriverById(existing.id),error:null});return;}}catch(lookupError){next(lookupError);return;}
    next(err);
  }
});

// Manual-review KYC: `status` only ever changes here, by whoever holds `drivers:edit` —
// no automatic verification logic and no third-party call sets this field.
router.patch('/:id', requirePermission('drivers', 'edit'), requireDriverOwnership, validateBody(UpdateDriverSchema), async (req, res, next) => {
  try {
    if (req.body.status === 'Verified') {
      const existing = await driverService.getDriverById(req.params.id);
      if (existing.status !== 'Verified' && !(await administrativeQueue(req))) throw new HttpError(403,'KYC_APPROVAL_FORBIDDEN','Final KYC approval requires administrative review authority');
    }
    const driver = await driverService.updateDriver(req.params.id, req.body, {actorId:req.user!.sub,canChangeStatus:req.body.driverStatusMasterId === undefined ? false : (await resolveEffectivePermissionsForUser(req.user!.sub,req.user!.roles)).includes('drivers:status_change')});
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
  requireDriverOwnership,
  validateBody(SetDriverStatusSchema),
  async (req, res, next) => {
    try {
      const driver = await driverService.setDriverAccountStatus(req.params.id, req.body.accountStatus);
      await auditService.writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'driver.status_change',
        targetType: 'Driver',
        targetId: driver.id,
        after: { accountStatus: req.body.accountStatus,reason:req.body.reason??null },
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

router.get('/:id/documents', requirePermission('drivers', 'view'), requireDriverOwnership, async (req, res, next) => {
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
  requireDriverOwnership,
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
        typeKey: parsed.data.typeKey,
        replaceDocumentId: parsed.data.replaceDocumentId,
      regNo: parsed.data.regNo,
      expiresAt: parsed.data.expiresAt,
        fileName: file?.originalname,
        filePath: file ? `drivers/${req.params.id}/${file.filename}` : undefined,
        mimeType: file?.mimetype,
        sizeBytes: file?.size,
      }, {actorUserId:req.user!.sub,action:'driver.document.upload',...requestMeta(req)});

      res.status(201).json({ data: doc, error: null });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id/documents/:docId', requirePermission('drivers', 'edit'), requireDriverOwnership, async (req, res, next) => {
  try {
    const doc = await driverService.deleteDriverDocument(req.params.id, req.params.docId, {actorUserId:req.user!.sub,action:'driver.document.delete',...requestMeta(req)});
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
  requireDriverOwnership,
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

router.patch('/:id/unlink-user', requirePermission('drivers', 'assign'), requireDriverOwnership, async (req, res, next) => {
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
router.post('/:id/create-user', requirePermission('drivers', 'assign'), requireDriverOwnership, async (req, res, next) => {
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

// ---------------------------------------------------------------------------
// KYC verifier assignment + per-category checklist — independent of the manual-review
// `status` verdict changed by `PATCH /:id` above, which stays gated by `drivers:edit` only.
// A KYC verifier never gets `drivers:view`/`drivers:edit` — see `resolveAssignedDriver`-style
// ownership checks below, exactly mirroring `resolveOwnDriver`'s posture for `/drivers/me`.
// ---------------------------------------------------------------------------

router.patch(
  '/:id/assign-verifier',
  requirePermission('drivers', 'assign'),
  requireDriverOwnership,
  validateBody(AssignVerifierSchema),
  async (req, res, next) => {
    try {
      const previous=await driverService.getDriverById(req.params.id);
      if(req.body.expectedVerifierId!==undefined && (previous.assignedVerifierId??null)!==req.body.expectedVerifierId) throw new HttpError(409,'ASSIGNMENT_CHANGED','This assignment changed. Reload the current verifier before saving.');
      if(previous.assignedVerifierId&&previous.assignedVerifierId!==req.body.verifierId&&!req.body.reason?.trim())throw new HttpError(422,'REASON_REQUIRED','A reassignment reason is required');
      if ((previous.assignedVerifierId ?? null) === req.body.verifierId) { res.json({data:previous,error:null}); return; }
      const driver = await driverService.assignVerifier(req.params.id, req.body.verifierId, req.body.expectedVerifierId !== undefined ? req.body.expectedVerifierId : previous.assignedVerifierId ?? null,{actorUserId:req.user!.sub,reason:req.body.reason,...requestMeta(req)});
      res.json({ data: driver, error: null });
    } catch (err) {
      next(err);
    }
  },
);

// The KYC queue — gated by `kyc-assignments:view` (puts the screen in the sidebar at all);
// row-level scoping is ownership, not permission (always the caller's own assigned drivers).
router.get('/assigned-to-me', requirePermission('kyc-assignments', 'view'), async (req, res, next) => {
  try {
    const query=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),search:z.string().max(150).optional(),sort:z.string().max(50).optional(),direction:z.enum(['asc','desc']).optional(),state:z.enum(['Unassigned','Assigned','Issues Raised','Completed']).optional()}).parse(req.query);
    const result=await driverService.listDriversAssignedTo(req.user!.sub,query,await administrativeQueue(req));
    res.json({data:result.rows,error:null,meta:result.meta});
  } catch (err) {
    next(err);
  }
});

// No requirePermission here on purpose — ownership (assignedVerifierId === caller) IS the
// authorization, exactly like resolveOwnDriver's /drivers/me. 404s whether the driver doesn't
// exist or simply isn't assigned to this caller (never distinguishes the two).
router.get('/assigned-to-me/:id', requirePermission('kyc-assignments', 'view'), async (req, res, next) => {
  try {
    const driver = await administrativeQueue(req)?await driverService.getDriverById(req.params.id):await driverService.getAssignedDriverById(req.params.id, req.user!.sub);
    res.json({ data: driver, error: null });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/kyc-checklist', requirePermission('kyc-assignments', 'edit'), validateBody(KycChecklistSchema), async (req, res, next) => {
  try {
    const driver = await driverService.setKycChecklistItem(
      req.params.id,
      req.user!.sub,
      req.body.category,
      req.body.status,
      req.body.notes,
    );
    await auditService.writeAuditLog({
      actorUserId: req.user!.sub,
      action: 'driver.kyc.checklist_update',
      targetType: 'Driver',
      targetId: driver.id,
      after: { category: req.body.category, status: req.body.status, notes: req.body.notes },
      ...requestMeta(req),
    });
    res.json({ data: driver, error: null });
  } catch (err) {
    next(err);
  }
});

export default router;
