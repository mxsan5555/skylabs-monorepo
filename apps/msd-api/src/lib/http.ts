import type { Response } from 'express';
import type { ApiEnvelope } from '@skylabs-monorepo/shared-types';

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'CONFLICT'
  | 'BAD_REQUEST';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

/** Thrown from services/routes; caught by middleware/errorHandler.ts and translated to the envelope. */
export class ApiError extends Error {
  code: ErrorCode;
  details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function sendData<T>(
  res: Response,
  data: T,
  opts: { status?: number; meta?: ApiEnvelope<T>['meta'] } = {},
): void {
  const body: ApiEnvelope<T> = { data, error: null, ...(opts.meta ? { meta: opts.meta } : {}) };
  res.status(opts.status ?? 200).json(body);
}

export function sendError(res: Response, code: ErrorCode, message: string, details?: unknown): void {
  const body: ApiEnvelope<null> = { data: null, error: { code, message, details } };
  res.status(STATUS_BY_CODE[code]).json(body);
}
