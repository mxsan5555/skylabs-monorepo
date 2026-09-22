import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma-client';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** 404 fallback for unmatched routes — register after all route mounts. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

/** Global error handler — register last in main.ts. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ data: null, error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // Prisma unique-constraint violation — every `@unique`/`@@unique` field across the
  // schema (customer mobile numbers, vehicle numbers, master item names, ...) hits this,
  // not just one module, so it's translated here rather than per-service.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const fields = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
    res.status(409).json({
      data: null,
      error: { code: 'CONFLICT', message: `A record with this ${fields} already exists.` },
    });
    return;
  }

  console.error({ err, path: req.path, userId: req.user?.sub });
  res.status(500).json({ data: null, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
}
