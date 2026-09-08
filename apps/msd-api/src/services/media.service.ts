import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { deleteMediaFile, writeMediaFile } from '../lib/media-storage';
import { validateMediaFile, MAX_IMAGES_PER_ENTITY } from './media-validation.service';

/** `category` covers all three Category depth tiers (Category/Subcategory/Type are all just
 *  Category rows — see category.service.ts's module doc comment) with one shared `CategoryImage`
 *  table, image-only (no `videoAdapter` entry — see `CategoryImage`'s schema doc comment).
 *  `blog` (BlogPost) and `about-us` (the singleton AboutUsContent row) are the CMS module's
 *  entries — both image-only, same as `category` (no `videoAdapter` entry for either — see
 *  `BlogPostImage`/`AboutUsImage`'s schema doc comments). */
export type MediaEntityType = 'deal' | 'product' | 'therapist' | 'vendor' | 'category' | 'blog' | 'about-us';

export interface MediaFile {
  buffer: Buffer;
  originalname: string;
}

interface ImageAdapter {
  storageSubdir: string;
  parentIdColumn: string;
  delegate: {
    findMany: (args: unknown) => Promise<Array<{ id: string; isPrimary: boolean; sortOrder: number; storageKey: string }>>;
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<{ id: string }>;
    update: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<{ storageKey: string }>;
    findUnique: (args: unknown) => Promise<{ id: string; isPrimary: boolean; storageKey: string } | null>;
    updateMany: (args: unknown) => Promise<unknown>;
  };
}

interface VideoAdapter {
  storageSubdir: string;
  parentIdColumn: string;
  delegate: {
    findUnique: (args: unknown) => Promise<{ id: string; storageKey: string } | null>;
    upsert: (args: unknown) => Promise<{ id: string }>;
    delete: (args: unknown) => Promise<{ storageKey: string }>;
  };
}

// prisma[delegateName] is typed generically here since the six delegates share the same
// image/video shape but aren't a common Prisma type — cast once, at the boundary, rather than
// scattering `as any` through every function below.
function imageAdapter(entityType: MediaEntityType): ImageAdapter {
  const config: Record<MediaEntityType, { subdir: string; column: string; delegate: string }> = {
    deal: { subdir: 'deals', column: 'dealId', delegate: 'dealImage' },
    product: { subdir: 'products', column: 'productId', delegate: 'productImage' },
    therapist: { subdir: 'therapists', column: 'therapistId', delegate: 'therapistImage' },
    vendor: { subdir: 'vendors', column: 'vendorId', delegate: 'vendorImage' },
    category: { subdir: 'categories', column: 'categoryId', delegate: 'categoryImage' },
    blog: { subdir: 'blog-posts', column: 'blogPostId', delegate: 'blogPostImage' },
    'about-us': { subdir: 'about-us', column: 'aboutUsId', delegate: 'aboutUsImage' },
  };
  const { subdir, column, delegate } = config[entityType];
  return {
    storageSubdir: subdir,
    parentIdColumn: column,
    delegate: (prisma as unknown as Record<string, ImageAdapter['delegate']>)[delegate],
  };
}

/** Partial, not a full `Record<MediaEntityType, ...>` — `category` has no video model (see
 *  `CategoryImage`'s schema doc comment), so it deliberately has no entry here; calling
 *  `replaceVideo`/`deleteVideo` with `'category'` throws a clear error instead of crashing on an
 *  undefined Prisma delegate. */
function videoAdapter(entityType: MediaEntityType): VideoAdapter {
  const config: Partial<Record<MediaEntityType, { subdir: string; column: string; delegate: string }>> = {
    deal: { subdir: 'deals', column: 'dealId', delegate: 'dealVideo' },
    product: { subdir: 'products', column: 'productId', delegate: 'productVideo' },
    therapist: { subdir: 'therapists', column: 'therapistId', delegate: 'therapistVideo' },
    vendor: { subdir: 'vendors', column: 'vendorId', delegate: 'vendorVideo' },
  };
  const entry = config[entityType];
  if (!entry) throw new ApiError('VALIDATION_ERROR', `${entityType} does not support video uploads.`);
  const { subdir, column, delegate } = entry;
  return {
    storageSubdir: subdir,
    parentIdColumn: column,
    delegate: (prisma as unknown as Record<string, VideoAdapter['delegate']>)[delegate],
  };
}

export async function addImage(entityType: MediaEntityType, parentId: string, file: MediaFile) {
  const adapter = imageAdapter(entityType);
  const existingCount = await adapter.delegate.count({ where: { [adapter.parentIdColumn]: parentId } });
  if (existingCount >= MAX_IMAGES_PER_ENTITY) {
    throw new ApiError('VALIDATION_ERROR', `You can upload at most ${MAX_IMAGES_PER_ENTITY} images.`);
  }
  const validated = validateMediaFile(file.buffer, 'image');
  const { storageKey, sizeBytes } = await writeMediaFile(adapter.storageSubdir, parentId, file.buffer, validated.extension);
  const isPrimary = existingCount === 0;
  try {
    const created = await adapter.delegate.create({
      data: {
        [adapter.parentIdColumn]: parentId,
        storageKey,
        originalFilename: file.originalname || null,
        mimeType: validated.sniffedType,
        sizeBytes,
        sortOrder: existingCount,
        isPrimary,
      },
    });
    return created;
  } catch (err) {
    await deleteMediaFile(storageKey);
    throw err;
  }
}

export async function deleteImage(entityType: MediaEntityType, parentId: string, imageId: string) {
  const adapter = imageAdapter(entityType);
  const image = await adapter.delegate.findUnique({ where: { id: imageId } });
  if (!image || (image as unknown as Record<string, string>)[adapter.parentIdColumn] !== parentId) {
    throw new ApiError('NOT_FOUND', 'Image not found');
  }
  await adapter.delegate.delete({ where: { id: imageId } });
  // The DB delete already committed — a non-ENOENT failure deleting the physical file (disk
  // issue, permissions) must not skip the primary-image-reassignment step below; log and
  // continue rather than let it propagate.
  try {
    await deleteMediaFile(image.storageKey);
  } catch (err) {
    console.error({ err, context: 'deleteImage: failed to delete image file', entityType, parentId, imageId, storageKey: image.storageKey });
  }

  if (image.isPrimary) {
    const next = await adapter.delegate.findMany({
      where: { [adapter.parentIdColumn]: parentId },
      orderBy: { sortOrder: 'asc' },
      take: 1,
    });
    if (next.length > 0) {
      await adapter.delegate.update({ where: { id: next[0].id }, data: { isPrimary: true } });
    }
  }
}

export async function reorderImages(entityType: MediaEntityType, parentId: string, orderedImageIds: string[]) {
  const adapter = imageAdapter(entityType);
  const existing = await adapter.delegate.findMany({ where: { [adapter.parentIdColumn]: parentId } });
  const existingIds = new Set(existing.map((img) => img.id));
  if (orderedImageIds.length !== existing.length || !orderedImageIds.every((id) => existingIds.has(id))) {
    throw new ApiError('VALIDATION_ERROR', 'Reorder list must contain exactly this entity\'s current images.');
  }
  await prisma.$transaction(
    orderedImageIds.map((id, index) => adapter.delegate.update({ where: { id }, data: { sortOrder: index } }) as never),
  );
}

export async function setPrimaryImage(entityType: MediaEntityType, parentId: string, imageId: string) {
  const adapter = imageAdapter(entityType);
  const image = await adapter.delegate.findUnique({ where: { id: imageId } });
  if (!image || (image as unknown as Record<string, string>)[adapter.parentIdColumn] !== parentId) {
    throw new ApiError('NOT_FOUND', 'Image not found');
  }
  await prisma.$transaction([
    adapter.delegate.updateMany({
      where: { [adapter.parentIdColumn]: parentId, isPrimary: true },
      data: { isPrimary: false },
    }) as never,
    adapter.delegate.update({ where: { id: imageId }, data: { isPrimary: true } }) as never,
  ]);
}

export async function replaceVideo(entityType: MediaEntityType, parentId: string, file: MediaFile) {
  const adapter = videoAdapter(entityType);
  const validated = validateMediaFile(file.buffer, 'video');
  const existing = await adapter.delegate.findUnique({ where: { [adapter.parentIdColumn]: parentId } as never });
  const { storageKey, sizeBytes } = await writeMediaFile(adapter.storageSubdir, parentId, file.buffer, validated.extension);
  let upserted;
  try {
    upserted = await adapter.delegate.upsert({
      where: { [adapter.parentIdColumn]: parentId },
      create: {
        [adapter.parentIdColumn]: parentId,
        storageKey,
        originalFilename: file.originalname || null,
        mimeType: validated.sniffedType,
        sizeBytes,
      },
      update: {
        storageKey,
        originalFilename: file.originalname || null,
        mimeType: validated.sniffedType,
        sizeBytes,
      },
    });
  } catch (err) {
    // The upsert itself failed — the DB never got the new storageKey, so the just-written new
    // file is genuinely orphaned and safe to clean up.
    await deleteMediaFile(storageKey);
    throw err;
  }

  // The upsert succeeded — the DB row now correctly points at the new file. A non-ENOENT
  // failure deleting the OLD file must not be caught by the rollback logic above (which would
  // wrongly delete the NEW file the DB now points to, corrupting an already-successful
  // replace); log and continue instead.
  if (existing) {
    try {
      await deleteMediaFile(existing.storageKey);
    } catch (err) {
      console.error({ err, context: 'replaceVideo: failed to delete old video file', entityType, parentId, storageKey: existing.storageKey });
    }
  }

  return upserted;
}

export async function deleteVideo(entityType: MediaEntityType, parentId: string) {
  const adapter = videoAdapter(entityType);
  const existing = await adapter.delegate.findUnique({ where: { [adapter.parentIdColumn]: parentId } as never });
  if (!existing) throw new ApiError('NOT_FOUND', 'Video not found');
  await adapter.delegate.delete({ where: { [adapter.parentIdColumn]: parentId } as never });
  await deleteMediaFile(existing.storageKey);
}
