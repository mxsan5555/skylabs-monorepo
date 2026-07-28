import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { OtpError } from '../lib/otp';
import { env } from '../env';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', details: err.issues });
    return;
  }

  if (err instanceof OtpError) {
    res.status(err.status).json({ error: err.code, retryAfterSeconds: err.retryAfterSeconds });
    return;
  }

  if (!env.isProduction) console.error(err);
  res.status(500).json({ error: 'internal_error' });
}
