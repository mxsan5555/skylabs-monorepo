/** Shortest JWT signing secret production accepts (256 bits as text). */
export const MIN_JWT_SECRET_LENGTH = 32;

/** Bytes `FIELD_ENCRYPTION_KEY` must decode to (AES-256). */
export const FIELD_KEY_BYTES = 32;

/** Secrets production cannot run without: KYC document storage, the document number hash,
 *  field encryption and the cron endpoint guard. */
const REQUIRED_IN_PRODUCTION = ['R2_PRIVATE_BUCKET', 'DOC_HASH_PEPPER', 'FIELD_ENCRYPTION_KEY', 'CRON_SECRET'] as const;

type EnvSource = Record<string, string | undefined>;

const value = (source: EnvSource, name: string) => source[name]?.trim() ?? '';

/**
 * Every reason the given environment is unsafe for production (P2-09), as messages that name
 * the variable and never echo its value. Empty means safe. `config/env.ts` throws at boot when
 * `NODE_ENV=production` and this is not empty.
 */
export function productionEnvProblems(source: EnvSource): string[] {
  const problems: string[] = [];

  if (value(source, 'JWT_SECRET').length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }

  const origins = value(source, 'CORS_ORIGIN')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) problems.push('CORS_ORIGIN is required');
  else if (origins.includes('*')) problems.push('CORS_ORIGIN must list exact origins, not *');

  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!value(source, name)) problems.push(`${name} is required`);
  }

  if (value(source, 'DEV_OTP_IDENTIFIERS')) {
    problems.push('DEV_OTP_IDENTIFIERS must be unset in production');
  }

  const fieldKey = value(source, 'FIELD_ENCRYPTION_KEY');
  if (fieldKey && Buffer.from(fieldKey, 'base64').length !== FIELD_KEY_BYTES) {
    problems.push(`FIELD_ENCRYPTION_KEY must be ${FIELD_KEY_BYTES} bytes, base64`);
  }

  return problems;
}
