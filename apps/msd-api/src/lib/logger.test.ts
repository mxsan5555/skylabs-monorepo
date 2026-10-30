import { afterEach, describe, expect, it } from 'vitest';
import { logger, redact, redactUrl, REDACTED, setLogSink } from './logger';

afterEach(() => setLogSink(null));

/** P2-10: logs never carry personal data or secrets. */
describe('redact', () => {
  it('masks sensitive keys at any depth, whatever their case or separators', () => {
    const out = redact({
      Authorization: 'Bearer abc',
      user: { id: 'u1', otp: '123456', profile: { document_number: 'ABCDE1234F', bankAccountNumber: '1234567890' } },
      items: [{ refreshToken: 'r1', name: 'Calm Spa' }],
    });
    expect(out).toEqual({
      Authorization: REDACTED,
      user: { id: 'u1', otp: REDACTED, profile: { document_number: REDACTED, bankAccountNumber: REDACTED } },
      items: [{ refreshToken: REDACTED, name: 'Calm Spa' }],
    });
  });

  it('keeps an error as name, message and stack, and survives a cycle', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    const out = redact({ err: new Error('boom'), cyclic }) as { err: { name: string; message: string; stack?: string }; cyclic: { self: unknown } };
    expect(out.err.name).toBe('Error');
    expect(out.err.message).toBe('boom');
    expect(out.cyclic.self).toBe('[circular]');
  });
});

describe('redactUrl', () => {
  it('masks sensitive query values and keeps the rest', () => {
    expect(redactUrl('/api/v1/auth/otp/verify?identifier=x&otp=123456&token=abc')).toBe(
      `/api/v1/auth/otp/verify?identifier=x&otp=${encodeURIComponent(REDACTED)}&token=${encodeURIComponent(REDACTED)}`,
    );
    expect(redactUrl('/api/v1/catalog/deals?page=2')).toBe('/api/v1/catalog/deals?page=2');
  });
});

describe('logger', () => {
  it('writes one JSON line with level, time and event, redacted', () => {
    const lines: string[] = [];
    setLogSink((line) => lines.push(line));
    logger.info('member.updated', { memberId: 'm1', bankAccountNumber: '1234567890' });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ level: 'info', event: 'member.updated', memberId: 'm1', bankAccountNumber: REDACTED });
    expect(typeof entry.time).toBe('string');
    expect(lines[0]).not.toContain('1234567890');
  });
});
