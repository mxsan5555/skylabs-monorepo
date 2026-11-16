import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { ApiError } from '../lib/http';

export const CRON_SECRET_HEADER = 'x-cron-secret';

/** Hashing first gives both sides one length, so the compare is constant time for any input. */
const digest = (value: string) => createHash('sha256').update(value).digest();

/** Guards scheduler-only routes. 503 until `CRON_SECRET` is configured, 401 for a wrong secret. */
export const requireCronSecret: RequestHandler = (req, _res, next) => {
  if (!env.cronSecret) return next(new ApiError('SERVICE_UNAVAILABLE', 'Scheduled jobs are not configured.'));
  const given = req.header(CRON_SECRET_HEADER) ?? '';
  if (!timingSafeEqual(digest(given), digest(env.cronSecret))) return next(new ApiError('UNAUTHORIZED', 'Invalid job secret.'));
  next();
};
