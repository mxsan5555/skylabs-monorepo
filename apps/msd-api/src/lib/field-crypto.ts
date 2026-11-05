import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { FIELD_KEY_BYTES } from '../config/env-checks';

const isProduction = (): boolean => env.nodeEnv === 'production';

function key(): Buffer | null {
  if (!env.fieldEncryptionKey) {
    if (isProduction()) throw new Error('FIELD_ENCRYPTION_KEY is required in production');
    return null;
  }
  const buf = Buffer.from(env.fieldEncryptionKey, 'base64');
  if (buf.length !== FIELD_KEY_BYTES) throw new Error(`FIELD_ENCRYPTION_KEY must decode to ${FIELD_KEY_BYTES} bytes`);
  return buf;
}

/** AES-256-GCM. Returns `v1:iv:tag:ciphertext` (base64), or null when no key is configured (development only). */
export function encryptField(plain: string): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptField(payload: string): string {
  const k = key();
  if (!k) throw new Error('FIELD_ENCRYPTION_KEY is not configured');
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || ciphertext === undefined) {
    throw new Error('Unsupported ciphertext');
  }
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

/** HMAC-SHA256 of type and number. Null when no pepper is configured in development (duplicate check skipped). */
export function hashDocumentNumber(type: string, normalized: string): string | null {
  if (!env.docHashPepper) {
    if (isProduction()) throw new Error('DOC_HASH_PEPPER is required in production');
    return null;
  }
  return createHmac('sha256', env.docHashPepper).update(`${type}:${normalized}`).digest('hex');
}

/** Constant time comparison of two hex hashes. */
export function hashesEqual(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
