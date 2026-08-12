import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const OtpPurposeSchema = z.enum(['login', 'signup', 'change_phone', 'change_email']).openapi('OtpPurpose');

export const OtpRequestSchema = z
  .object({
    identifier: z.string().min(3).openapi({ example: 'driver@example.com' }),
    purpose: OtpPurposeSchema.default('login'),
  })
  .openapi('OtpRequest');

export const OtpVerifySchema = z
  .object({
    identifier: z.string().min(3),
    otp: z.string().length(6),
    purpose: OtpPurposeSchema.default('login'),
  })
  .openapi('OtpVerify');

export const RefreshRequestSchema = z
  .object({
    refreshToken: z.string().min(10),
  })
  .openapi('RefreshRequest');

export const LogoutRequestSchema = z
  .object({
    refreshToken: z.string().min(10),
  })
  .openapi('LogoutRequest');

export const TokenPairResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: z.object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      roles: z.array(z.string()),
    }),
  })
  .openapi('TokenPairResponse');
