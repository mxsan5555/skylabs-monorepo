import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

/** Validates `req.body` against a Zod schema; replaces `req.body` with the parsed (typed) result. */
export function validateBody(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: result.error.flatten() },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Validates `req.query` against a Zod schema; replaces `req.query` with the parsed (typed) result. */
export function validateQuery(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(422).json({
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query params', details: result.error.flatten() },
      });
      return;
    }
    req.query = result.data as never;
    next();
  };
}
