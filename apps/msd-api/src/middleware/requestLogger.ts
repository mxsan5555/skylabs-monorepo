import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger, redactUrl } from '../lib/logger';

export const REQUEST_ID_HEADER = 'X-Request-Id';
/** An incoming id is kept only when it is short and plain (no spaces, newlines or quotes). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const NS_PER_MS = 1_000_000;

/**
 * Gives every request an id (a safe incoming `X-Request-Id`, else a new UUID) on `req.requestId`
 * and the response header, then logs one `http.request` line when the response finishes: method,
 * path with sensitive query values masked, status, duration and user id. Never the body or
 * headers (P2-10). Off in tests unless `env.requestLogging` is switched on.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    if (!env.requestLogging) return;
    logger.info('http.request', {
      requestId,
      method: req.method,
      path: redactUrl(req.originalUrl),
      status: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - started) / NS_PER_MS,
      userId: req.user?.sub,
    });
  });
  next();
}
