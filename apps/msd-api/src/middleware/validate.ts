import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { sendError } from '../lib/http';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid request body', result.error.flatten());
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid query parameters', result.error.flatten());
      return;
    }
    // req.query is a getter-only object on some Express/Node versions; store parsed separately.
    (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      sendError(res, 'VALIDATION_ERROR', 'Invalid route parameters', result.error.flatten());
      return;
    }
    // zod's parsed output is a plain object; Express types req.params as ParamsDictionary
    // (an indexed { [key: string]: string }), so a structural cast is needed here.
    req.params = result.data as typeof req.params;
    next();
  };
}
