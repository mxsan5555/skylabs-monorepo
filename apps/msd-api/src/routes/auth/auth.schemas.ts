import { z } from 'zod';
import { registry } from '../../lib/openapi-registry';

export const otpRequestSchema = z.object({
  method: z.enum(['email', 'phone']),
  destination: z.string().min(3).max(320),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpRequestResponseSchema = z.object({
  ok: z.literal(true),
  retryAfterSeconds: z.number(),
});

export const otpVerifySchema = z.object({
  method: z.enum(['email', 'phone']),
  destination: z.string().min(3).max(320),
  code: z.string().length(6),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const userResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const authSuccessResponseSchema = z.object({
  token: z.string(),
  roles: z.array(z.string()),
  user: userResponseSchema,
});

export const exchangeRequestSchema = z.object({
  code: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
  retryAfterSeconds: z.number().optional(),
});

registry.registerPath({
  method: 'post',
  path: '/auth/otp/request',
  summary: 'Request an OTP code for email or phone sign-in (new destinations are registered automatically)',
  request: { body: { content: { 'application/json': { schema: otpRequestSchema } } } },
  responses: {
    200: {
      description: 'Code sent (or would have been, if the destination exists) — response never reveals which',
      content: { 'application/json': { schema: otpRequestResponseSchema } },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: errorResponseSchema } } },
    429: { description: 'Resend cooldown or hourly rate limit', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/otp/verify',
  summary: 'Verify an OTP code and receive a JWT',
  request: { body: { content: { 'application/json': { schema: otpVerifySchema } } } },
  responses: {
    200: { description: 'Signed in', content: { 'application/json': { schema: authSuccessResponseSchema } } },
    400: { description: 'Invalid, expired, or too many attempts', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/google',
  summary: 'Start Google OAuth sign-in',
  responses: { 302: { description: 'Redirect to Google' } },
});

registry.registerPath({
  method: 'get',
  path: '/auth/google/callback',
  summary: 'Google OAuth callback',
  responses: { 302: { description: 'Redirect to the frontend at /auth/callback?code=...' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/exchange',
  summary: 'Exchange a one-time code (from the Google OAuth redirect) for a JWT',
  request: { body: { content: { 'application/json': { schema: exchangeRequestSchema } } } },
  responses: {
    200: { description: 'Signed in', content: { 'application/json': { schema: authSuccessResponseSchema } } },
    400: { description: 'Invalid or expired code', content: { 'application/json': { schema: errorResponseSchema } } },
  },
});
