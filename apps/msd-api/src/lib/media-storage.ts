import * as crypto from 'crypto';
import * as path from 'path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

/**
 * Cloudflare R2 storage backend for the media-upload system (Deal/Product/Therapist/Vendor/
 * Category/CMS images+video). R2 is S3-compatible, so we drive it with the AWS S3 client pointed
 * at the account's R2 endpoint. Files are validated (media-validation.service.ts) fully in-memory
 * before this module ever uploads — only a validated buffer is sent.
 *
 * `storageKey` (what gets persisted on the DB row) is always relative to the bucket root, e.g.
 * "deals/<dealId>/<uuid>.jpg" — it is also the R2 object key. The DB never stores the bucket's
 * public hostname, so the R2 public URL can change without a data migration: the frontend builds
 * the displayable URL by prefixing `VITE_MEDIA_BASE_URL` onto the stored `storageKey`
 * (see apps/msd/src/api/media.ts's `resolveMediaUrl`).
 *
 * Railway's container filesystem is ephemeral (wiped on every redeploy), which is why media lives
 * in R2 and not on local disk — see DEPLOYMENT.md.
 */

// Content type per extension the validator accepts (media-validation.service.ts). Kept here so
// writeMediaFile's signature stays (subdir, parentId, buffer, ext) and media.service.ts is
// untouched — the sniffed MIME the service already stores on the DB row isn't needed for the
// upload itself.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
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

export async function writeMediaFile(
  subdir: string,
  parentId: string,
  buffer: Buffer,
  ext: string,
): Promise<{ storageKey: string; sizeBytes: number }> {
  const filename = `${crypto.randomUUID()}${ext}`;
  const storageKey = path.posix.join(subdir, parentId, filename);
  await r2().send(
    new PutObjectCommand({
      Bucket: env.r2Bucket,
      Key: storageKey,
      Body: buffer,
      ContentType: CONTENT_TYPE_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream',
    }),
  );
  return { storageKey, sizeBytes: buffer.length };
}

export async function deleteMediaFile(storageKey: string): Promise<void> {
  // S3/R2 DeleteObject is idempotent — deleting a missing key succeeds, so there's no
  // "not found" case to swallow (unlike the old local-disk ENOENT handling).
  await r2().send(new DeleteObjectCommand({ Bucket: env.r2Bucket, Key: storageKey }));
}
