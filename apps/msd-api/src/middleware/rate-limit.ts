import rateLimit from 'express-rate-limit';

// Blunt outer IP guard; the per-destination cooldown/hourly cap in lib/otp.ts
// is the real anti-abuse control (an IP-only limit doesn't stop someone
// rotating IPs to bomb one victim's inbox).
export const otpIpRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
