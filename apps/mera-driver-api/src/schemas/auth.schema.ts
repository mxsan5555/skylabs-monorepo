import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const OtpPurposeSchema = z
  .enum(['login', 'signup', 'change_phone', 'change_email', 'password_reset'])
  .openapi('OtpPurpose');

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

// ---------------------------------------------------------------------------
// Password auth — additive alongside OTP/Google, same User model, same JWT/session system.
// ---------------------------------------------------------------------------

export const PasswordLoginSchema = z
  .object({
    identifier: z.string().min(3).openapi({ example: 'admin@example.com' }),
    password: z.string().min(1),
  })
  .openapi('PasswordLogin');

export const ForgotPasswordSchema = z
  .object({
    identifier: z.string().min(3),
  })
  .openapi('ForgotPassword');

export const ResetPasswordSchema = z
  .object({
    identifier: z.string().min(3),
    otp: z.string().length(6),
    newPassword: z.string().min(8),
  })
  .openapi('ResetPassword');

export const SetPasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8),
  })
  .openapi('SetPassword');
