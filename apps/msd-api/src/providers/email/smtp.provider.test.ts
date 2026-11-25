import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const smtpMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  createConnection: vi.fn(),
}));

vi.mock('nodemailer', () => ({ default: { createTransport: smtpMocks.createTransport } }));
vi.mock('node:net', () => ({ createConnection: smtpMocks.createConnection }));

beforeEach(() => {
  vi.resetModules();
  // Keep the provider tests isolated from and unable to load the developer's .env.local secrets.
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret-with-at-least-32-characters');
  vi.stubEnv('CORS_ORIGIN', 'https://example.com');
  vi.stubEnv('R2_PRIVATE_BUCKET', 'test-private-bucket');
  vi.stubEnv('DOC_HASH_PEPPER', 'test-only-pepper');
  vi.stubEnv('FIELD_ENCRYPTION_KEY', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
  vi.stubEnv('CRON_SECRET', 'test-only-cron-secret');
  vi.stubEnv('SMTP_HOST', 'smtp.gmail.com');
  vi.stubEnv('SMTP_PORT', '587');
  vi.stubEnv('SMTP_SECURE', 'false');
  vi.stubEnv('SMTP_USER', 'smtp-user-secret@example.com');
  vi.stubEnv('SMTP_PASS', 'smtp-password-secret');
  vi.stubEnv('EMAIL_FROM', 'MySpaDeal <no-reply@example.com>');
  smtpMocks.createConnection.mockReset();
  smtpMocks.createTransport.mockReset().mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'message-id', response: '250 accepted' }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('SMTP email provider', () => {
  it('sets bounded SMTP timeouts and opens an IPv4 socket through Nodemailer getSocket', async () => {
    const provider = await import('./smtp.provider');
    await provider.sendEmail('customer@example.com', 'Subject', 'Message');

    const [transportOptions] = smtpMocks.createTransport.mock.calls[0] as [
      {
        host: string;
        port: number;
        secure: boolean;
        connectionTimeout: number;
        greetingTimeout: number;
        socketTimeout: number;
        getSocket: (options: { host?: string; port?: number }, callback: (err: Error | null, options: object) => void) => void;
      },
    ];

    expect(transportOptions).toMatchObject({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    const socket = new EventEmitter() as Socket;
    smtpMocks.createConnection.mockReturnValue(socket);
    const callback = vi.fn();
    transportOptions.getSocket({ host: 'smtp.gmail.com', port: 587 }, callback);

    expect(smtpMocks.createConnection).toHaveBeenCalledWith({ host: 'smtp.gmail.com', port: 587, family: 4 });
    socket.emit('connect');
    expect(callback).toHaveBeenCalledWith(null, { connection: socket });
  });

  it('passes IPv4 socket connection failures to Nodemailer', async () => {
    const provider = await import('./smtp.provider');
    await provider.sendEmail('customer@example.com', 'Subject', 'Message');
    const [transportOptions] = smtpMocks.createTransport.mock.calls[0] as [
      {
        getSocket: (options: { host?: string; port?: number }, callback: (err: Error | null, options: object) => void) => void;
      },
    ];
    const socket = new EventEmitter() as Socket;
    smtpMocks.createConnection.mockReturnValue(socket);
    const callback = vi.fn();
    const networkError = Object.assign(new Error('Network is unreachable'), { code: 'ENETUNREACH' });

    transportOptions.getSocket({ host: 'smtp.gmail.com', port: 587 }, callback);
    socket.emit('error', networkError);

    expect(callback).toHaveBeenCalledWith(networkError, {});
  });

  it('returns false on SMTP connection failure and does not log the OTP or SMTP credentials', async () => {
    const provider = await import('./smtp.provider');
    const sendMail = vi.fn().mockRejectedValue(
      new Error('connect failed with smtp-user-secret@example.com smtp-password-secret 135790'),
    );
    smtpMocks.createTransport.mockReturnValue({ sendMail });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(provider.sendOtpEmail('customer@example.com', '135790')).resolves.toBe(false);

    const logged = errorLog.mock.calls.flat().join(' ');
    expect(logged).not.toContain('smtp-user-secret@example.com');
    expect(logged).not.toContain('smtp-password-secret');
    expect(logged).not.toContain('135790');
  });
});
