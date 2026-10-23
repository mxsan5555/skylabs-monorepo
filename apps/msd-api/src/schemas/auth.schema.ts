import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const OtpPurposeSchema = z.enum(['login', 'signup', 'change_phone', 'change_email']).openapi('OtpPurpose');
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;

export const OtpRequestSchema = z
  .object({
    identifier: z.string().min(3).max(255).openapi({ example: 'user@example.com' }),
    purpose: OtpPurposeSchema.default('login'),
  })
  .openapi('OtpRequest');

export const OtpVerifySchema = z
  .object({
    identifier: z.string().min(3).max(255),
    otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
  })
  .openapi('OtpVerify');

export const AuthUserSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    roles: z.array(z.string()),
  })
  .openapi('AuthUser');

/** The refresh token itself never appears in a response body — it's set as an HttpOnly cookie
 *  (see lib/auth-cookies.ts) so page JS (and therefore localStorage) never has access to it. */
export const AuthTokensResponseSchema = z
  .object({
    accessToken: z.string(),
    user: AuthUserSchema,
  })
  .openapi('AuthTokensResponse');
