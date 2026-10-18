import * as crypto from 'crypto';
import * as path from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { ApiError } from './http';

/**
 * Cloudflare R2 storage backend for every upload. R2 is S3-compatible, so we drive it with the
 * AWS S3 client pointed at the account's R2 endpoint. Files are validated
 * (media-validation.service.ts) fully in-memory before this module ever uploads.
 *
 * Two buckets (docs/msd/ARCHITECTURE.md §12.3):
 * - `public` (`R2_BUCKET`): website media. The frontend builds the URL by prefixing
 *   `VITE_MEDIA_BASE_URL` onto the stored `storageKey` (apps/msd/src/api/media.ts).
 * - `private` (`R2_PRIVATE_BUCKET`, no public access): member KYC documents, opened only through
 *   `signedFileUrl` links that expire.
 *
 * `storageKey` (persisted on the DB row) is the object key, relative to the bucket root, built
 * from a `storageFolder` in lib/storage-layout.ts plus a random UUID file name. The DB never
 * stores a hostname, so URLs can change without a data migration.
 *
 * Railway's container filesystem is wiped on every redeploy, which is why media lives in R2 and
 * not on local disk — see docs/DEPLOYMENT.md §6.
 */
export type StorageBucket = 'public' | 'private';

/** Signed links for private files expire after this many seconds (PLANNING §2.3). */
export const SIGNED_URL_TTL_SECONDS = 300;

// Content type per extension the validator accepts (media-validation.service.ts).
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

let client: S3Client | null = null;

// Lazily constructed so importing this module never requires R2 env vars (tests mock this module
// wholesale, and other API code paths that don't touch media shouldn't need R2 configured).
function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return client;
}

function bucketName(bucket: StorageBucket): string {
  if (bucket === 'public') return env.r2Bucket;
  // Never fall back to the public bucket: identity documents must not become public by mistake.
  if (!env.r2PrivateBucket) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Private document storage is not configured (R2_PRIVATE_BUCKET).');
  }
  return env.r2PrivateBucket;
}

/** Uploads into `folder` (from `storageFolder`) under a random file name. */
export async function writeMediaFile(
  folder: string,
  buffer: Buffer,
  ext: string,
  bucket: StorageBucket = 'public',
): Promise<{ storageKey: string; sizeBytes: number }> {
  const storageKey = path.posix.join(folder, `${crypto.randomUUID()}${ext}`);
  await r2().send(
    new PutObjectCommand({
      Bucket: bucketName(bucket),
      Key: storageKey,
      Body: buffer,
      ContentType: CONTENT_TYPE_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream',
    }),
  );
  return { storageKey, sizeBytes: buffer.length };
}

export async function deleteMediaFile(storageKey: string, bucket: StorageBucket = 'public'): Promise<void> {
  // S3/R2 DeleteObject is idempotent — deleting a missing key succeeds.
  await r2().send(new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: storageKey }));
}

/** A link that opens one file for `SIGNED_URL_TTL_SECONDS`, then stops working. */
export async function signedFileUrl(storageKey: string, bucket: StorageBucket): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucketName(bucket), Key: storageKey }), {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}
