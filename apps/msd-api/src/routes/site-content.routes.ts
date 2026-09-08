import { Router } from 'express';
import type { Request } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validateBody, validateParams } from '../middleware/validate';
import { AboutUsUpdateSchema, ContactUsUpdateSchema } from '../schemas/site-content.schema';
import { MediaReorderSchema } from '../schemas/media.schema';
import * as siteContentService from '../services/site-content.service';
import { writeAuditLog } from '../services/audit.service';
import { sendData, ApiError } from '../lib/http';
import { imageUpload } from '../lib/media-upload.middleware';
import { z } from 'zod';

/**
 * About Us + Contact Us admin content — both singleton rows (schema.prisma's own doc comment on
 * each model), so unlike blog-posts.routes.ts there is no `:id` in any of these paths; every
 * route below implicitly targets the one saved row. Declares its own full paths (`/about-us`,
 * `/contact-us`) rather than mounting under a shared resource prefix, since it's genuinely two
 * small, independent sub-resources sharing one router file — mount this router at `/` in app.ts.
 *
 * Because this router is mounted at `/`, it must NOT use a router-wide `router.use(authenticate)`
 * — Express runs that unconditionally for every request that reaches this router (any path, since
 * the `/` mount strips zero characters), which would 401 every other router registered anywhere in
 * app.ts, including unauthenticated public/webhook routes, regardless of registration order.
 * `authenticate` is applied per-route below instead, so requests to paths this router doesn't own
 * fall through to the next router via Express's normal no-route-matched `next()`.
 */
const router = Router();

function requestMeta(req: Request) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

const ImageIdParamSchema = z.object({ imageId: z.string().uuid() });

// ─── About Us ────────────────────────────────────────────────────────────────

router.get('/about-us', authenticate, requirePermission('cms.about-us', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await siteContentService.getAboutUs());
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/about-us',
  authenticate,
  requirePermission('cms.about-us', 'edit'),
  validateBody(AboutUsUpdateSchema),
  async (req, res, next) => {
    try {
      const aboutUs = await siteContentService.updateAboutUs(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'about_us.update',
        targetType: 'AboutUsContent',
        targetId: aboutUs.id,
        after: aboutUs,
        ...requestMeta(req),
      });
      sendData(res, aboutUs);
    } catch (err) {
      next(err);
    }
  },
);

// ─── About Us media (shared upload system — see media.service.ts's doc comment). No `:id` param
// — always targets the one singleton row. ───────────────────────────────────────────────────────

router.post(
  '/about-us/images',
  authenticate,
  requirePermission('cms.about-us', 'edit'),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError('VALIDATION_ERROR', 'No file was uploaded.');
      const image = await siteContentService.addAboutUsImage({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'about_us_image.create',
        targetType: 'AboutUsImage',
        targetId: image.id,
        ...requestMeta(req),
      });
      sendData(res, image, { status: 201 });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/about-us/images/:imageId',
  authenticate,
  requirePermission('cms.about-us', 'edit'),
  validateParams(ImageIdParamSchema),
  async (req, res, next) => {
    try {
      await siteContentService.deleteAboutUsImage(req.params.imageId);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'about_us_image.delete',
        targetType: 'AboutUsImage',
        targetId: req.params.imageId,
        ...requestMeta(req),
      });
      sendData(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/about-us/images/reorder',
  authenticate,
  requirePermission('cms.about-us', 'edit'),
  validateBody(MediaReorderSchema),
  async (req, res, next) => {
    try {
      await siteContentService.reorderAboutUsImages(req.body.imageIds);
      sendData(res, { reordered: true });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/about-us/images/:imageId/primary',
  authenticate,
  requirePermission('cms.about-us', 'edit'),
  validateParams(ImageIdParamSchema),
  async (req, res, next) => {
    try {
      await siteContentService.setAboutUsPrimaryImage(req.params.imageId);
      sendData(res, { primary: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Contact Us (no media — see ContactUsContent's schema doc comment) ────────

router.get('/contact-us', authenticate, requirePermission('cms.contact-us', 'view'), async (_req, res, next) => {
  try {
    sendData(res, await siteContentService.getContactUs());
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/contact-us',
  authenticate,
  requirePermission('cms.contact-us', 'edit'),
  validateBody(ContactUsUpdateSchema),
  async (req, res, next) => {
    try {
      const contactUs = await siteContentService.updateContactUs(req.body);
      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: 'contact_us.update',
        targetType: 'ContactUsContent',
        targetId: contactUs.id,
        after: contactUs,
        ...requestMeta(req),
      });
      sendData(res, contactUs);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
