import { env } from '../config/env';
import { normalizeIdentifier } from './normalizeIdentifier';

/** Compares identifiers the way login stores them: `+91XXXXXXXXXX` phones, lower-case emails. */
const comparable = (identifier: string) => normalizeIdentifier(identifier).toLowerCase();

/**
 * True when `identifier` is a local test account from `DEV_OTP_IDENTIFIERS`: its OTP is printed
 * in the API console instead of being sent, so seeded users with made-up phones and emails can
 * sign in. Never true in production (the production boot check also refuses a set list).
 */
export function isDevOtpIdentifier(identifier: string): boolean {
  if (env.nodeEnv === 'production' || env.devOtpIdentifiers.length === 0) return false;
  const wanted = comparable(identifier);
  return env.devOtpIdentifiers.some((entry) => comparable(entry) === wanted);
}
