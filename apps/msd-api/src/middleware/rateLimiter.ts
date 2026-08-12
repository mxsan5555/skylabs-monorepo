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
