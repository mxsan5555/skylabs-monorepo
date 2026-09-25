import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';
import { sendError } from '../lib/http';

/** 5 req/10 min per identifier+IP (per skylabs-api.md / docs/api-schema/msd/00-conventions.md). */
export const otpRequestRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.otpRequestRateLimitPer10Min,
  standardHeaders: true,
  legacyHeaders: false,
  // ipKeyGenerator normalizes IPv6 addresses so a /64 subnet can't be used to dodge the
  // per-IP part of the key (express-rate-limit throws ERR_ERL_KEY_GEN_IPV6 without it).
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${(req.body?.identifier as string | undefined) ?? ''}`,
  handler: (req, res) => {
    sendError(res, 'RATE_LIMITED', 'Too many OTP requests, please try again later');
  },
});

/** The public "Become a Vendor" registration is this codebase's only other anonymous-write
 *  surface besides OTP request — same discipline reused rather than inventing a separate
 *  rate-limiting mechanism: same window, same configured limit, same IP+identifier key shape
 *  (keyed on whichever of ownerEmail/ownerMobile was submitted). */
export const vendorPublicRegisterRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.otpRequestRateLimitPer10Min,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? '')}:${(req.body?.ownerEmail as string | undefined) ?? (req.body?.ownerMobile as string | undefined) ?? ''}`,
  handler: (req, res) => {
    sendError(res, 'RATE_LIMITED', 'Too many registration attempts, please try again later');
  },
});
