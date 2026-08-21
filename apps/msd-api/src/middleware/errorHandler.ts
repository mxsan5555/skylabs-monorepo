import type { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ApiError, sendError } from '../lib/http';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ApiError) {
    sendError(res, err.code, err.message, err.details);
    return;
  }

  // multer throws before any route handler code runs (e.g. LIMIT_FILE_SIZE from the HTTP-layer
  // ceiling in media-upload.middleware.ts) — surface a real message instead of a generic 500.
  if (err instanceof MulterError) {
    sendError(res, 'VALIDATION_ERROR', err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message);
    return;
  }

  console.error({ err, path: req.path, userId: req.user?.sub });
  sendError(res, 'SERVER_ERROR', 'Internal server error');
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
}
