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

export const RefreshRequestSchema = z
  .object({
    refreshToken: z.string().min(10),
  })
  .openapi('RefreshRequest');

export const AuthUserSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email().nullable(),
    phone: z.string().nullable(),
    roles: z.array(z.string()),
  })
  .openapi('AuthUser');

export const AuthTokensResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: AuthUserSchema,
  })
  .openapi('AuthTokensResponse');
