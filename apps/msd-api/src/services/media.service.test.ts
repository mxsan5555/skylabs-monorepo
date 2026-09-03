import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../lib/media-storage', () => ({
  writeMediaFile: vi.fn(async (_subdir: string, _parentId: string, buffer: Buffer) => ({
    storageKey: 'deals/deal-1/fake.jpg',
    sizeBytes: buffer.length,
  })),
  deleteMediaFile: vi.fn(async () => undefined),
}));

import { prisma } from '../lib/prisma';
import { writeMediaFile, deleteMediaFile } from '../lib/media-storage';
import * as mediaService from './media.service';
import { ApiError } from '../lib/http';
import { MAX_IMAGES_PER_ENTITY } from './media-validation.service';

const prismaMock = vi.mocked(prisma, true);
const writeMediaFileMock = vi.mocked(writeMediaFile);
const deleteMediaFileMock = vi.mocked(deleteMediaFile);

function jpegBuffer(size = 50 * 1024): Buffer {
  const buffer = Buffer.alloc(size, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('media.service.addImage', () => {
  it('makes the first image for an entity primary automatically', async () => {
    prismaMock.dealImage.count.mockResolvedValue(0);
    prismaMock.dealImage.create.mockResolvedValue({ id: 'img-1' });

    await mediaService.addImage('deal', 'deal-1', { buffer: jpegBuffer(), originalname: 'a.jpg' });

    expect(prismaMock.dealImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: true, sortOrder: 0 }) }),
    );
  });

  it('does not mark the second image primary', async () => {
    prismaMock.dealImage.count.mockResolvedValue(1);
    prismaMock.dealImage.create.mockResolvedValue({ id: 'img-2' });

    await mediaService.addImage('deal', 'deal-1', { buffer: jpegBuffer(), originalname: 'b.jpg' });

    expect(prismaMock.dealImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: false, sortOrder: 1 }) }),
    );
  });

  it('rejects once the entity already has the max number of images', async () => {
    prismaMock.dealImage.count.mockResolvedValue(MAX_IMAGES_PER_ENTITY);

    await expect(
      mediaService.addImage('deal', 'deal-1', { buffer: jpegBuffer(), originalname: 'c.jpg' }),
    ).rejects.toThrow(ApiError);
    expect(writeMediaFileMock).not.toHaveBeenCalled();
  });

  it('cleans up the written file if the DB create fails', async () => {
    prismaMock.dealImage.count.mockResolvedValue(0);
    prismaMock.dealImage.create.mockRejectedValue(new Error('db down'));

    await expect(
      mediaService.addImage('deal', 'deal-1', { buffer: jpegBuffer(), originalname: 'd.jpg' }),
    ).rejects.toThrow('db down');
    expect(deleteMediaFileMock).toHaveBeenCalledWith('deals/deal-1/fake.jpg');
  });

  it('routes Product/Therapist through the same generic core, just a different delegate', async () => {
    prismaMock.productImage.count.mockResolvedValue(0);
    prismaMock.productImage.create.mockResolvedValue({ id: 'p-img-1' });
    await mediaService.addImage('product', 'product-1', { buffer: jpegBuffer(), originalname: 'e.jpg' });
    expect(prismaMock.productImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 'product-1' }) }),
    );

    prismaMock.therapistImage.count.mockResolvedValue(0);
    prismaMock.therapistImage.create.mockResolvedValue({ id: 't-img-1' });
    await mediaService.addImage('therapist', 'therapist-1', { buffer: jpegBuffer(), originalname: 'f.jpg' });
    expect(prismaMock.therapistImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ therapistId: 'therapist-1' }) }),
    );
  });

  it('routes Category through the same generic core (covers all 3 depth tiers — same table)', async () => {
    prismaMock.categoryImage.count.mockResolvedValue(0);
    prismaMock.categoryImage.create.mockResolvedValue({ id: 'c-img-1' });
    await mediaService.addImage('category', 'category-1', { buffer: jpegBuffer(), originalname: 'g.jpg' });
    expect(prismaMock.categoryImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: 'category-1' }) }),
    );
  });
});

describe('media.service category has no video support', () => {
  it('throws a clear VALIDATION_ERROR instead of crashing on an undefined delegate', async () => {
    const mp4 = Buffer.alloc(500 * 1024, 0);
    mp4.write('ftyp', 4, 'ascii');
    mp4.write('isom', 8, 'ascii');
    await expect(
      mediaService.replaceVideo('category', 'category-1', { buffer: mp4, originalname: 'v.mp4' }),
    ).rejects.toThrow(ApiError);
    await expect(mediaService.deleteVideo('category', 'category-1')).rejects.toThrow(ApiError);
  });
});

describe('media.service.deleteImage', () => {
  it('deletes the DB row and the physical file', async () => {
    prismaMock.dealImage.findUnique.mockResolvedValue({ id: 'img-1', dealId: 'deal-1', isPrimary: false, storageKey: 'deals/deal-1/img-1.jpg' });
    prismaMock.dealImage.delete.mockResolvedValue({ storageKey: 'deals/deal-1/img-1.jpg' });

    await mediaService.deleteImage('deal', 'deal-1', 'img-1');

    expect(prismaMock.dealImage.delete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
    expect(deleteMediaFileMock).toHaveBeenCalledWith('deals/deal-1/img-1.jpg');
  });

  it('404s if the image does not belong to this parent entity', async () => {
    prismaMock.dealImage.findUnique.mockResolvedValue({ id: 'img-1', dealId: 'some-other-deal', isPrimary: false, storageKey: 'x' });

    await expect(mediaService.deleteImage('deal', 'deal-1', 'img-1')).rejects.toThrow(ApiError);
    expect(prismaMock.dealImage.delete).not.toHaveBeenCalled();
  });

  it('auto-promotes the next image by sortOrder when the deleted image was primary', async () => {
    prismaMock.dealImage.findUnique.mockResolvedValue({ id: 'img-1', dealId: 'deal-1', isPrimary: true, storageKey: 'x' });
    prismaMock.dealImage.delete.mockResolvedValue({ storageKey: 'x' });
    prismaMock.dealImage.findMany.mockResolvedValue([{ id: 'img-2', dealId: 'deal-1', isPrimary: false, sortOrder: 1, storageKey: 'y' }]);
    prismaMock.dealImage.update.mockResolvedValue({});

    await mediaService.deleteImage('deal', 'deal-1', 'img-1');

    expect(prismaMock.dealImage.update).toHaveBeenCalledWith({ where: { id: 'img-2' }, data: { isPrimary: true } });
  });

  it('leaves the entity with zero primary images when the deleted primary was the last image', async () => {
    prismaMock.dealImage.findUnique.mockResolvedValue({ id: 'img-1', dealId: 'deal-1', isPrimary: true, storageKey: 'x' });
    prismaMock.dealImage.delete.mockResolvedValue({ storageKey: 'x' });
    prismaMock.dealImage.findMany.mockResolvedValue([]);

    await mediaService.deleteImage('deal', 'deal-1', 'img-1');

    expect(prismaMock.dealImage.update).not.toHaveBeenCalled();
  });

  it('still runs the primary-image-reassignment step when the physical file delete fails (non-ENOENT)', async () => {
    prismaMock.dealImage.findUnique.mockResolvedValue({ id: 'img-1', dealId: 'deal-1', isPrimary: true, storageKey: 'x' });
    prismaMock.dealImage.delete.mockResolvedValue({ storageKey: 'x' });
    prismaMock.dealImage.findMany.mockResolvedValue([{ id: 'img-2', dealId: 'deal-1', isPrimary: false, sortOrder: 1, storageKey: 'y' }]);
    prismaMock.dealImage.update.mockResolvedValue({});
    deleteMediaFileMock.mockRejectedValueOnce(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));

    // The DB delete already committed; a disk-level failure deleting the file must not abort
    // the function or skip promoting the next image to primary.
    await expect(mediaService.deleteImage('deal', 'deal-1', 'img-1')).resolves.toBeUndefined();

    expect(prismaMock.dealImage.update).toHaveBeenCalledWith({ where: { id: 'img-2' }, data: { isPrimary: true } });
  });
});

describe('media.service.reorderImages', () => {
  it('rejects a reorder list that does not exactly match the entity current images', async () => {
    prismaMock.dealImage.findMany.mockResolvedValue([{ id: 'img-1' }, { id: 'img-2' }]);

    await expect(mediaService.reorderImages('deal', 'deal-1', ['img-1'])).rejects.toThrow(ApiError);
  });

  it('persists the new sortOrder for every image in the given order', async () => {
    prismaMock.dealImage.findMany.mockResolvedValue([{ id: 'img-1' }, { id: 'img-2' }]);
    prismaMock.dealImage.update.mockResolvedValue({});

    await mediaService.reorderImages('deal', 'deal-1', ['img-2', 'img-1']);

    expect(prismaMock.dealImage.update).toHaveBeenCalledWith({ where: { id: 'img-2' }, data: { sortOrder: 0 } });
    expect(prismaMock.dealImage.update).toHaveBeenCalledWith({ where: { id: 'img-1' }, data: { sortOrder: 1 } });
  });
});

describe('media.service.setPrimaryImage', () => {
  it('flips off the old primary and flips on the new one, inside a transaction', async () => {
    prismaMock.dealImage.findUnique.mockResolvedValue({ id: 'img-2', dealId: 'deal-1', isPrimary: false, storageKey: 'y' });
    prismaMock.dealImage.updateMany.mockResolvedValue({});
    prismaMock.dealImage.update.mockResolvedValue({});

    await mediaService.setPrimaryImage('deal', 'deal-1', 'img-2');

    expect(prismaMock.dealImage.updateMany).toHaveBeenCalledWith({
      where: { dealId: 'deal-1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(prismaMock.dealImage.update).toHaveBeenCalledWith({ where: { id: 'img-2' }, data: { isPrimary: true } });
  });

  it('404s if the image does not belong to this parent entity', async () => {
    prismaMock.dealImage.findUnique.mockResolvedValue({ id: 'img-2', dealId: 'some-other-deal', isPrimary: false, storageKey: 'y' });

    await expect(mediaService.setPrimaryImage('deal', 'deal-1', 'img-2')).rejects.toThrow(ApiError);
  });
});

describe('media.service video (replace/delete)', () => {
  it('upserts a video row and deletes the old physical file when replacing an existing video', async () => {
    prismaMock.dealVideo.findUnique.mockResolvedValue({ id: 'vid-1', storageKey: 'deals/deal-1/old.mp4' });
    prismaMock.dealVideo.upsert.mockResolvedValue({ id: 'vid-1' });

    const mp4 = Buffer.alloc(500 * 1024, 0);
    mp4.write('ftyp', 4, 'ascii');
    mp4.write('isom', 8, 'ascii');

    await mediaService.replaceVideo('deal', 'deal-1', { buffer: mp4, originalname: 'v.mp4' });

    expect(prismaMock.dealVideo.upsert).toHaveBeenCalled();
    expect(deleteMediaFileMock).toHaveBeenCalledWith('deals/deal-1/old.mp4');
  });

  it('does not delete the newly-written video file when only the OLD file delete fails (non-ENOENT)', async () => {
    prismaMock.dealVideo.findUnique.mockResolvedValue({ id: 'vid-1', storageKey: 'deals/deal-1/old.mp4' });
    prismaMock.dealVideo.upsert.mockResolvedValue({ id: 'vid-1' });
    // Only the OLD-file delete call should fail — the upsert itself succeeded, so the DB row
    // now correctly points at the NEW file (deals/deal-1/fake.jpg per this file's writeMediaFile
    // mock). Before the fix, this failure was caught by the upsert's own rollback try/catch and
    // wrongly deleted that new file, corrupting an already-successful replace.
    deleteMediaFileMock.mockImplementation(async (storageKey: string) => {
      if (storageKey === 'deals/deal-1/old.mp4') throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    });

    const mp4 = Buffer.alloc(500 * 1024, 0);
    mp4.write('ftyp', 4, 'ascii');
    mp4.write('isom', 8, 'ascii');

    await expect(mediaService.replaceVideo('deal', 'deal-1', { buffer: mp4, originalname: 'v.mp4' })).resolves.toEqual({ id: 'vid-1' });

    // The new file (returned by the writeMediaFile mock at the top of this file) must never be
    // deleted — only the old one was attempted (and failed).
    expect(deleteMediaFileMock).not.toHaveBeenCalledWith('deals/deal-1/fake.jpg');
  });

  it('404s deleting a video that does not exist', async () => {
    prismaMock.dealVideo.findUnique.mockResolvedValue(null);
    await expect(mediaService.deleteVideo('deal', 'deal-1')).rejects.toThrow(ApiError);
  });

  it('deletes an existing video row and its physical file', async () => {
    prismaMock.dealVideo.findUnique.mockResolvedValue({ id: 'vid-1', storageKey: 'deals/deal-1/v.mp4' });
    prismaMock.dealVideo.delete.mockResolvedValue({ storageKey: 'deals/deal-1/v.mp4' });

    await mediaService.deleteVideo('deal', 'deal-1');

    expect(deleteMediaFileMock).toHaveBeenCalledWith('deals/deal-1/v.mp4');
  });
});
