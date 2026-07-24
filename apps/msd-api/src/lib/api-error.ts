/** Thrown by route/service code for expected non-2xx outcomes (404/403/409/503/...).
 *  Caught by middleware/error-handler.ts and turned into `{ error: code }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export const notFound = (code = 'not_found') => new ApiError(404, code);
export const forbidden = (code = 'forbidden') => new ApiError(403, code);
export const conflict = (code = 'conflict') => new ApiError(409, code);
export const badRequest = (code = 'bad_request') => new ApiError(400, code);
export const notConfigured = (code = 'payment_gateway_not_configured') => new ApiError(503, code);
