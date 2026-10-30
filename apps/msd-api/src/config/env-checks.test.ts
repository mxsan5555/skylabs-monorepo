import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN_JWT_SECRET_LENGTH, productionEnvProblems } from './env-checks';

const KEY_32 = Buffer.alloc(32, 7).toString('base64');
const GOOD = {
  JWT_SECRET: 'x'.repeat(MIN_JWT_SECRET_LENGTH),
  CORS_ORIGIN: 'https://myspadeal.in,https://www.myspadeal.in',
  R2_PRIVATE_BUCKET: 'msd-documents',
  DOC_HASH_PEPPER: 'pepper',
  FIELD_ENCRYPTION_KEY: KEY_32,
  CRON_SECRET: 'cron',
};

/** P2-09: production refuses to boot on weak or missing security settings. */
describe('productionEnvProblems', () => {
  it('passes a complete production environment', () => {
    expect(productionEnvProblems(GOOD)).toEqual([]);
  });

  it('rejects a JWT secret shorter than the minimum', () => {
    expect(productionEnvProblems({ ...GOOD, JWT_SECRET: 'short' })).toEqual([
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
    ]);
  });

  it('rejects a wildcard or missing CORS origin', () => {
    expect(productionEnvProblems({ ...GOOD, CORS_ORIGIN: 'https://myspadeal.in, *' })).toEqual([
      'CORS_ORIGIN must list exact origins, not *',
    ]);
    expect(productionEnvProblems({ ...GOOD, CORS_ORIGIN: '' })).toEqual(['CORS_ORIGIN is required']);
  });

  it('names every missing secret, never its value', () => {
    const problems = productionEnvProblems({ JWT_SECRET: GOOD.JWT_SECRET, CORS_ORIGIN: GOOD.CORS_ORIGIN });
    expect(problems).toEqual([
      'R2_PRIVATE_BUCKET is required',
      'DOC_HASH_PEPPER is required',
      'FIELD_ENCRYPTION_KEY is required',
      'CRON_SECRET is required',
    ]);
  });

  it('rejects a field encryption key that is not 32 bytes of base64', () => {
    const problems = productionEnvProblems({ ...GOOD, FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') });
    expect(problems).toEqual(['FIELD_ENCRYPTION_KEY must be 32 bytes, base64']);
    expect(problems.join(' ')).not.toContain(Buffer.alloc(16).toString('base64'));
  });

  it('refuses the dev OTP list in production', () => {
    expect(productionEnvProblems({ ...GOOD, DEV_OTP_IDENTIFIERS: '9112312391' })).toEqual([
      'DEV_OTP_IDENTIFIERS must be unset in production',
    ]);
  });

  it('treats blank values as missing', () => {
    expect(productionEnvProblems({ ...GOOD, CRON_SECRET: '   ' })).toEqual(['CRON_SECRET is required']);
  });
});

describe('env boot in production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const stubProduction = (overrides: Record<string, string>) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/msd_test');
    for (const [name, v] of Object.entries({ ...GOOD, ...overrides })) vi.stubEnv(name, v);
  };

  it('fails fast and names the problem, not the value', async () => {
    stubProduction({ JWT_SECRET: 'weak-secret' });
    vi.resetModules();
    await expect(import('./env')).rejects.toThrow(/JWT_SECRET must be at least/);
    await expect(import('./env')).rejects.not.toThrow(/weak-secret/);
  });

  it('boots with a complete production environment', async () => {
    stubProduction({});
    vi.resetModules();
    await expect(import('./env')).resolves.toHaveProperty('env.nodeEnv', 'production');
  });
});
