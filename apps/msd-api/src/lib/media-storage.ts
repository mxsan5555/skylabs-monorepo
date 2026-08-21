import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '../config/env';

/**
 * Local-disk storage backend for the media-upload system (Deal/Product/Therapist images+video).
 * Files are validated (media-validation.service.ts) fully in-memory before this module ever
 * touches disk — only a validated buffer is written, so there's no cleanup-on-reject logic to
 * write. `storageKey` (what gets persisted on the DB row) is always relative to `uploadRoot`,
 * e.g. "deals/<dealId>/<uuid>.jpg" — the API serves it back at `/media/<storageKey>` (see
 * app.ts's `express.static` mount), so the DB never needs to know its own hostname.
 */
export function getUploadRoot(): string {
  return env.mediaUploadDir || path.join(__dirname, '../../uploads/media');
}

export async function writeMediaFile(
  subdir: string,
  parentId: string,
  buffer: Buffer,
  ext: string,
): Promise<{ storageKey: string; sizeBytes: number }> {
  const filename = `${crypto.randomUUID()}${ext}`;
  const relativeDir = path.posix.join(subdir, parentId);
  const storageKey = path.posix.join(relativeDir, filename);
  const absoluteDir = path.join(getUploadRoot(), subdir, parentId);
  await fs.promises.mkdir(absoluteDir, { recursive: true });
  await fs.promises.writeFile(path.join(absoluteDir, filename), buffer);
  return { storageKey, sizeBytes: buffer.length };
}

export async function deleteMediaFile(storageKey: string): Promise<void> {
  try {
    await fs.promises.unlink(path.join(getUploadRoot(), storageKey));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
