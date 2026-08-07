import type { Request, Response, NextFunction } from 'express';
import { ApiError, sendError } from '../lib/http';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ApiError) {
    sendError(res, err.code, err.message, err.details);
    return;
  }

  console.error({ err, path: req.path, userId: req.user?.sub });
  sendError(res, 'SERVER_ERROR', 'Internal server error');
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
}
