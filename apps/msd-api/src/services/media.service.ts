import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/http';
import { deleteMediaFile, writeMediaFile } from '../lib/media-storage';
import { validateMediaFile, MAX_IMAGES_PER_ENTITY } from './media-validation.service';

export type MediaEntityType = 'deal' | 'product' | 'therapist' | 'vendor';

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
  };
  const { subdir, column, delegate } = config[entityType];
  return {
    storageSubdir: subdir,
    parentIdColumn: column,
    delegate: (prisma as unknown as Record<string, ImageAdapter['delegate']>)[delegate],
  };
}

function videoAdapter(entityType: MediaEntityType): VideoAdapter {
  const config: Record<MediaEntityType, { subdir: string; column: string; delegate: string }> = {
    deal: { subdir: 'deals', column: 'dealId', delegate: 'dealVideo' },
    product: { subdir: 'products', column: 'productId', delegate: 'productVideo' },
    therapist: { subdir: 'therapists', column: 'therapistId', delegate: 'therapistVideo' },
    vendor: { subdir: 'vendors', column: 'vendorId', delegate: 'vendorVideo' },
  };
  const { subdir, column, delegate } = config[entityType];
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
  await deleteMediaFile(image.storageKey);

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
  try {
    const upserted = await adapter.delegate.upsert({
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
    if (existing) await deleteMediaFile(existing.storageKey);
    return upserted;
  } catch (err) {
    await deleteMediaFile(storageKey);
    throw err;
  }
}

export async function deleteVideo(entityType: MediaEntityType, parentId: string) {
  const adapter = videoAdapter(entityType);
  const existing = await adapter.delegate.findUnique({ where: { [adapter.parentIdColumn]: parentId } as never });
  if (!existing) throw new ApiError('NOT_FOUND', 'Video not found');
  await adapter.delegate.delete({ where: { [adapter.parentIdColumn]: parentId } as never });
  await deleteMediaFile(existing.storageKey);
}
