import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { documentUpload } from '../lib/media-upload.middleware';
import { VoucherCodeParamSchema, VoucherVerifySchema, VoucherShipSchema, VoucherDeliveryEvidenceSchema } from '../schemas/voucher.schema';
import * as voucherService from '../services/voucher.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';

/**
 * Member-only Purchase Verification surface — voucher lookup (via a QR scan only; there is no
 * manual code-entry path anywhere in this router's callers) + the Start/Finish/Pick-up/Ship/
 * Evidence actions. No OTP anywhere. Gated on `vendor-portal.orders:custom` the whole router
 * through (same self-service plumbing gate `/vendors/me/*` uses — see seed.ts's
 * `EXTRA_ACTIONS_BY_MENU_KEY` doc comment), never `vendor-portal.orders:view` alone. Lives on the
 * same page/route as the existing vendor-portal Orders screen (`business-order` menu node) — no
 * new menu node.
 */
const router = Router();
router.use(authenticate, requirePermission('vendor-portal.orders', 'custom'));

router.post('/verify', validateBody(VoucherVerifySchema), async (req, res, next) => {
  try {
    sendData(res, await voucherService.verifyVoucher(req.user!.sub, req.body.code));
  } catch (err) {
    next(err);
  }
});

/**
 * Orders page's "Services waiting" / "Products to give or send" lists (see
 * voucher.service.ts#listPendingFulfilment). Same single router-wide gate as every other route
 * here — no new permission key, no query params (unpaginated, unsearchable by design).
 */
router.get('/pending-fulfilment', async (req, res, next) => {
  try {
    sendData(res, await voucherService.listPendingFulfilment(req.user!.sub));
  } catch (err) {
    next(err);
  }
});

router.post('/:code/start', validateParams(VoucherCodeParamSchema), async (req, res, next) => {
  try {
    const entitlement = await voucherService.startService(req.user!.sub, req.params.code);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.start', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
    sendData(res, entitlement);
  } catch (err) {
    next(err);
  }
});

/** No body: the server never takes a status value from the client (see
 *  `voucher.service.ts#finishService`'s own doc comment). */
router.post('/:code/finish-service', validateParams(VoucherCodeParamSchema), async (req, res, next) => {
  try {
    const entitlement = await voucherService.finishService(req.user!.sub, req.params.code);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.finish_service', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
    sendData(res, entitlement);
  } catch (err) {
    next(err);
  }
});

/** No body — same discipline as `/finish-service`. */
router.post('/:code/pick-up', validateParams(VoucherCodeParamSchema), async (req, res, next) => {
  try {
    const entitlement = await voucherService.markProductPickedUp(req.user!.sub, req.params.code);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.pick_up', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
    sendData(res, entitlement);
  } catch (err) {
    next(err);
  }
});

router.post('/:code/ship', validateParams(VoucherCodeParamSchema), validateBody(VoucherShipSchema), async (req, res, next) => {
  try {
    const entitlement = await voucherService.shipProduct(req.user!.sub, req.params.code, req.body);
    await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.ship', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
    sendData(res, entitlement);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:code/record-delivery-evidence',
  validateParams(VoucherCodeParamSchema),
  documentUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'A delivery evidence photo is required');
      const { note } = VoucherDeliveryEvidenceSchema.parse({ note: req.body.note });
      const entitlement = await voucherService.recordDeliveryEvidence(
        req.user!.sub,
        req.params.code,
        { buffer: req.file.buffer, originalname: req.file.originalname },
        note,
      );
      await writeAuditLog({ actorUserId: req.user!.sub, action: 'voucher.record_delivery_evidence', targetType: 'PurchaseEntitlement', targetId: entitlement.id, after: entitlement });
      sendData(res, entitlement);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
