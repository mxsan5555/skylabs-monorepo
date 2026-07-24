import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../../middleware/require-auth';
import { prisma } from '../../lib/prisma-client';
import { requestOtp, verifyOtp } from '../../lib/otp';
import { sendOtpEmail } from '../../lib/email';
import { sendOtpSms } from '../../lib/sms';
import { conflict, notFound } from '../../lib/api-error';
import { registry } from '../../lib/openapi-registry';
import { OtpChannel, OtpPurpose, Gender, UserStatus } from '../../generated/prisma';

const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  marketingEmails: z.boolean().default(true),
  marketingSms: z.boolean().default(false),
  bookingReminders: z.boolean().default(true),
  defaultCity: z.string().nullable().default(null),
});

const meUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  gender: z.nativeEnum(Gender).optional(),
  dateOfBirth: z.string().datetime().optional(),
  locale: z.string().optional(),
  preferences: preferencesSchema.partial().optional(),
});

const avatarSchema = z.object({ avatarUrl: z.string().url() });
const changeContactStartSchema = z.object({ destination: z.string().min(3) });
const changeContactVerifySchema = z.object({ destination: z.string().min(3), code: z.string().length(6) });

const meResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roles: z.array(z.string()),
});

registry.registerPath({
  method: 'get',
  path: '/me',
  summary: 'Current authenticated user (used by the frontend to rehydrate user/roles on boot)',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Current user', content: { 'application/json': { schema: meResponseSchema } } },
    401: { description: 'Missing or invalid token' },
  },
});

export const meRouter = Router();

function toMeResponse(user: { id: string; name: string | null; email: string | null; phone: string | null; roles: string[] }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roles: user.roles.map((r) => r.toLowerCase()),
  };
}

meRouter.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
    res.json({
      ...toMeResponse(user),
      emailVerifiedAt: user.emailVerified ? user.updatedAt : null,
      phoneVerifiedAt: user.phoneVerified ? user.updatedAt : null,
      avatarUrl: user.avatarUrl,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      locale: user.locale,
      status: user.status,
      preferences: user.preferences,
    });
  } catch (err) {
    next(err);
  }
});

meRouter.patch('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const input = meUpdateSchema.parse(req.body);
    const existing = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
    const mergedPreferences = input.preferences
      ? { ...(existing.preferences as Record<string, unknown>), ...input.preferences }
      : undefined;
    const user = await prisma.user.update({
      where: { id: req.auth!.id },
      data: {
        name: input.name,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        locale: input.locale,
        preferences: mergedPreferences,
      },
    });
    res.json(toMeResponse(user));
  } catch (err) {
    next(err);
  }
});

meRouter.put('/avatar', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { avatarUrl } = avatarSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.auth!.id }, data: { avatarUrl } });
    res.json(toMeResponse(user));
  } catch (err) {
    next(err);
  }
});

meRouter.delete('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.auth!.id }, data: { status: UserStatus.DELETED } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Change phone / email — two-step OTP challenge against the NEW destination ──
// (docs list one endpoint each; a request+verify pair is the natural two-step
// shape, matching the existing /auth/otp/request+verify pattern.)

meRouter.post('/change-phone', requireAuth, async (req, res, next) => {
  try {
    const { destination } = changeContactStartSchema.parse(req.body);
    const taken = await prisma.user.findUnique({ where: { phone: destination } });
    if (taken) throw conflict('phone_already_in_use');
    const { code, retryAfterSeconds } = await requestOtp(prisma, {
      destination,
      channel: OtpChannel.PHONE,
      purpose: OtpPurpose.CHANGE_PHONE,
    });
    await sendOtpSms(destination, code);
    res.json({ ok: true, retryAfterSeconds });
  } catch (err) {
    next(err);
  }
});

meRouter.post('/change-phone/verify', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { destination, code } = changeContactVerifySchema.parse(req.body);
    await verifyOtp(prisma, { destination, code, purpose: OtpPurpose.CHANGE_PHONE });
    const user = await prisma.user.update({
      where: { id: req.auth!.id },
      data: { phone: destination, phoneVerified: true },
    });
    res.json(toMeResponse(user));
  } catch (err) {
    next(err);
  }
});

meRouter.post('/change-email', requireAuth, async (req, res, next) => {
  try {
    const { destination } = changeContactStartSchema.parse(req.body);
    const email = destination.trim().toLowerCase();
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) throw conflict('email_already_in_use');
    const { code, retryAfterSeconds } = await requestOtp(prisma, {
      destination: email,
      channel: OtpChannel.EMAIL,
      purpose: OtpPurpose.CHANGE_EMAIL,
    });
    await sendOtpEmail(email, code);
    res.json({ ok: true, retryAfterSeconds });
  } catch (err) {
    next(err);
  }
});

meRouter.post('/change-email/verify', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { destination, code } = changeContactVerifySchema.parse(req.body);
    const email = destination.trim().toLowerCase();
    await verifyOtp(prisma, { destination: email, code, purpose: OtpPurpose.CHANGE_EMAIL });
    const user = await prisma.user.update({
      where: { id: req.auth!.id },
      data: { email, emailVerified: true },
    });
    res.json(toMeResponse(user));
  } catch (err) {
    next(err);
  }
});
