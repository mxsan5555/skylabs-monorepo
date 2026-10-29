import { Router } from 'express';
import { contactMessageSchema } from '../schemas/contact.schema';
import { createContactMessage } from '../services/contact.service';
import { ApiError } from '../lib/http'; // apne existing error helper ke hisaab se
// import { rateLimit } from '../middleware/rate-limit'; // agar pehle se hai

const router = Router();

/**
 * POST /contact
 * Public endpoint – saves contact form submission.
 * Frontend still opens mailto after this succeeds.
 */
router.post(
  '/',
  // rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), // recommended
  async (req, res, next) => {
    try {
      const parsed = contactMessageSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new ApiError('VALIDATION_ERROR', 'Invalid input', {
          fields: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await createContactMessage(parsed.data);

      return res.status(201).json({
        ok: true,
        id: result.id,
        createdAt: result.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;