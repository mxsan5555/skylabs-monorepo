import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env';
import { sendError } from '../lib/http';
import { normalizeIdentifier } from '../lib/normalizeIdentifier';

const identifierKey = (value: unknown) => normalizeIdentifier(String(value ?? '').trim()).toLowerCase();

/** 5 req/10 min per identifier+IP (per skylabs-api.md / docs/msd/API.md §0). */
export const otpRequestRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.otpRequestRateLimitPer10Min,
  standardHeaders: true,
  legacyHeaders: false,
  // ipKeyGenerator normalizes IPv6 addresses so a /64 subnet can't be used to dodge the
  // per-IP part of the key (express-rate-limit throws ERR_ERL_KEY_GEN_IPV6 without it).
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${identifierKey(req.body?.identifier)}`,
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

/** Second OTP limit keyed on the identifier alone, so rotating IPs cannot buy fresh codes
 *  for one phone or email: `OTP_IDENTIFIER_RATE_LIMIT_PER_HOUR` sends per hour (default 10). */
export const otpIdentifierRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.otpIdentifierRateLimitPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `otp-id:${identifierKey(req.body?.identifier)}`,
  handler: (req, res) => {
    sendError(res, 'RATE_LIMITED', 'Too many OTP requests for this account, please try again later');
  },
});

/** Fixed dummy OTPs have no database challenge row to count wrong attempts against. Apply
 *  process-local failure limits only in dummy mode; random SMS/email OTPs keep their existing
 *  persisted per-challenge attempt counter. */
export const otpDummyVerifyRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.otpMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.otpProvider !== 'dummy',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${identifierKey(req.body?.identifier)}`,
  handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Too many incorrect OTP attempts, please try again later'),
});

/** Rotating IPs must not bypass the dummy OTP attempt limit for one fixed account. */
export const otpDummyIdentifierVerifyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.otpMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.otpProvider !== 'dummy',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `otp-dummy-verify:${identifierKey(req.body?.identifier)}`,
  handler: (_req, res) => sendError(res, 'RATE_LIMITED', 'Too many incorrect OTP attempts for this account, please try again later'),
});
