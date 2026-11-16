import { Router } from 'express';
import { requireCronSecret } from '../middleware/requireCronSecret';
import { runDocumentReminders } from '../services/member-reminder.service';
import { sendData } from '../lib/http';

/**
 * Scheduler-only routes, called by the Railway cron service with the `x-cron-secret` header.
 * No user session and no OpenAPI entry: these are not part of the public API.
 */
const router = Router();
router.use(requireCronSecret);

router.post('/document-reminders', async (_req, res, next) => {
  try {
    sendData(res, await runDocumentReminders());
  } catch (err) {
    next(err);
  }
});

export default router;
