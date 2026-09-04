import type { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { ApiError, sendError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';

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

  // Backstop for any Prisma error that reaches here without already being converted to a
  // friendlier ApiError at the call site (e.g. order.service.ts/vendor.service.ts/
  // wishlist.service.ts's own ad-hoc P2002 catches, which still run first and produce a more
  // specific message — this only catches what those don't).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      sendError(res, 'CONFLICT', 'A record with this value already exists.', { fields: err.meta?.target });
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 'NOT_FOUND', 'The requested record was not found.');
      return;
    }
    if (err.code === 'P2003') {
      sendError(res, 'BAD_REQUEST', 'This operation references a record that does not exist.', { field: err.meta?.field_name });
      return;
    }
  }

  console.error({ err, path: req.path, userId: req.user?.sub });
  sendError(res, 'SERVER_ERROR', 'Internal server error');
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
}
