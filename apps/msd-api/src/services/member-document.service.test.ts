import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'crypto';

vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});
vi.mock('../config/env', () => ({
  env: { fieldEncryptionKey: randomBytes(32).toString('base64'), docHashPepper: 'pepper' },
}));
vi.mock('../lib/media-storage', () => ({
  writeMediaFile: vi.fn().mockResolvedValue({ storageKey: 'vendor-documents/m1/file.pdf', sizeBytes: 10 }),
  deleteMediaFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./media-validation.service', () => ({
  validateMediaFile: vi.fn().mockReturnValue({ extension: 'pdf', sniffedType: 'application/pdf' }),
}));

import { Prisma } from '../generated/prisma-client';
import { prisma } from '../lib/prisma';
import { deleteMediaFile } from '../lib/media-storage';
import {
  documentsSummary,
  listMemberDocuments,
  uploadMemberDocument,
  reviewMemberDocument,
} from './member-document.service';

const prismaMock = vi.mocked(prisma, true);
const FILE = { buffer: Buffer.from('%PDF-1.4'), originalname: 'pan.pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.memberDocument.findUnique.mockResolvedValue(null);
  prismaMock.memberDocument.findFirst.mockResolvedValue(null);
});

describe('documentsSummary', () => {
  const NOW = new Date('2026-10-20T00:00:00Z');

  it('is complete when Aadhaar, PAN and GST are all submitted or approved', () => {
    const summary = documentsSummary(
      [
        { documentType: 'AADHAAR', status: 'APPROVED' },
        { documentType: 'PAN', status: 'SUBMITTED' },
        { documentType: 'GST', status: 'SUBMITTED' },
      ],
      new Date('2026-10-01T00:00:00Z'),
      NOW,
    );
    expect(summary).toMatchObject({ complete: true, missing: [], rejected: [], overdue: false });
  });

  it('lists what is missing and what was rejected, and marks overdue after the due date', () => {
    const summary = documentsSummary(
      [{ documentType: 'PAN', status: 'REJECTED' }],
      new Date('2026-10-01T00:00:00Z'),
      NOW,
    );
    expect(summary.complete).toBe(false);
    expect(summary.missing).toEqual(['AADHAAR', 'GST']);
    expect(summary.rejected).toEqual(['PAN']);
    expect(summary.overdue).toBe(true);
  });
});

describe('listMemberDocuments', () => {
  const ROW = {
    id: 'd1', documentType: 'PAN', status: 'SUBMITTED', numberMasked: 'ABXXXXX34F', storageKey: 'k', originalFilename: 'pan.pdf',
    mimeType: 'application/pdf', sizeBytes: 10, rejectionReason: null, reviewedAt: null, uploadedOnBehalf: true,
    uploadedByUserId: 'admin-1', createdAt: new Date(), updatedAt: new Date(), numberHash: 'h', numberEncrypted: 'c',
  };

  it('never returns hash or encrypted number, and hides file keys from viewers who cannot open files', async () => {
    prismaMock.memberDocument.findMany.mockResolvedValue([ROW]);
    const [row] = await listMemberDocuments('m1', { includeFiles: false });
    expect(row).not.toHaveProperty('numberHash');
    expect(row).not.toHaveProperty('numberEncrypted');
    expect(row).not.toHaveProperty('storageKey');
    expect(row).not.toHaveProperty('originalFilename');
    expect(row).not.toHaveProperty('numberMasked');
  });

  it('includes the file key and masked number for viewers who can open files', async () => {
    prismaMock.memberDocument.findMany.mockResolvedValue([ROW]);
    const [row] = await listMemberDocuments('m1', { includeFiles: true });
    expect(row.storageKey).toBe('k');
    expect(row.numberMasked).toBe('ABXXXXX34F');
    expect(row).not.toHaveProperty('numberHash');
    expect(row).not.toHaveProperty('numberEncrypted');
  });
});

describe('uploadMemberDocument', () => {
  it('stores masked number, hash and ciphertext, marks on behalf and resets review to SUBMITTED', async () => {
    prismaMock.memberDocument.upsert.mockResolvedValue({ id: 'd1' });
    await uploadMemberDocument({
      memberId: 'm1', documentType: 'PAN', file: FILE, number: 'abcde 1234 f', actorUserId: 'admin-1', onBehalf: true,
    });
    const arg = prismaMock.memberDocument.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ numberMasked: 'ABXXXXX34F', uploadedOnBehalf: true, uploadedByUserId: 'admin-1', status: 'SUBMITTED' });
    expect(arg.create.numberHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.create.numberEncrypted).toMatch(/^v1:/);
    expect(JSON.stringify(arg)).not.toContain('ABCDE1234F');
    expect(arg.update).toMatchObject({ status: 'SUBMITTED', rejectionReason: null, reviewedAt: null });
  });

  it('returns no hash or ciphertext to the caller', async () => {
    prismaMock.memberDocument.upsert.mockResolvedValue({
      id: 'd1', documentType: 'PAN', status: 'SUBMITTED', numberMasked: 'ABXXXXX34F', numberHash: 'h', numberEncrypted: 'c',
    });
    const result = await uploadMemberDocument({
      memberId: 'm1', documentType: 'PAN', file: FILE, number: 'ABCDE1234F', actorUserId: 'admin-1', onBehalf: true,
    });
    expect(result).not.toHaveProperty('numberHash');
    expect(result).not.toHaveProperty('numberEncrypted');
    expect(result.numberMasked).toBe('ABXXXXX34F');
  });

  it('rejects an invalid number with 422', async () => {
    await expect(
      uploadMemberDocument({ memberId: 'm1', documentType: 'PAN', file: FILE, number: 'NOTAPAN', actorUserId: 'a', onBehalf: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.memberDocument.upsert).not.toHaveBeenCalled();
  });

  it('rejects a number already used by another member with 409', async () => {
    prismaMock.memberDocument.findFirst.mockResolvedValue({ id: 'other', vendorId: 'm2' });
    await expect(
      uploadMemberDocument({ memberId: 'm1', documentType: 'PAN', file: FILE, number: 'ABCDE1234F', actorUserId: 'a', onBehalf: true }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NUMBER_IN_USE' });
    expect(prismaMock.memberDocument.upsert).not.toHaveBeenCalled();
  });

  it('maps a unique violation on the number hash to 409 and removes the new file', async () => {
    prismaMock.memberDocument.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['documentType', 'numberHash'] },
      }),
    );
    const err = await uploadMemberDocument({
      memberId: 'm1', documentType: 'PAN', file: FILE, number: 'ABCDE1234F', actorUserId: 'a', onBehalf: true,
    }).catch((e) => e);
    expect(err).toMatchObject({ code: 'DOCUMENT_NUMBER_IN_USE' });
    expect(JSON.stringify(err.details ?? null)).not.toContain('m2');
    expect(vi.mocked(deleteMediaFile)).toHaveBeenCalledWith('vendor-documents/m1/file.pdf');
  });

  it('a re-upload without a number clears the old masked number, hash and ciphertext', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({
      id: 'd1', storageKey: 'vendor-documents/m1/old.pdf', numberMasked: 'ABXXXXX34F', numberHash: 'h', numberEncrypted: 'c', status: 'APPROVED',
    });
    prismaMock.memberDocument.upsert.mockResolvedValue({ id: 'd1' });
    await uploadMemberDocument({ memberId: 'm1', documentType: 'PAN', file: FILE, actorUserId: 'admin-1', onBehalf: true });
    const arg = prismaMock.memberDocument.upsert.mock.calls[0][0];
    expect(arg.update).toMatchObject({ numberMasked: null, numberHash: null, numberEncrypted: null, status: 'SUBMITTED' });
    expect(arg.create).toMatchObject({ numberMasked: null, numberHash: null, numberEncrypted: null });
  });
});

describe('reviewMemberDocument', () => {
  it('approves a submitted document', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'SUBMITTED', vendorId: 'm1' });
    prismaMock.memberDocument.update.mockResolvedValue({ id: 'd1', status: 'APPROVED' });
    await reviewMemberDocument({ memberId: 'm1', documentType: 'PAN', decision: 'APPROVED', actorUserId: 'admin-1' });
    expect(prismaMock.memberDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', reviewedByUserId: 'admin-1' }) }),
    );
  });

  it('rejects with a reason and returns no hash or ciphertext', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'SUBMITTED', vendorId: 'm1' });
    prismaMock.memberDocument.update.mockResolvedValue({ id: 'd1', status: 'REJECTED', numberHash: 'h', numberEncrypted: 'c' });
    const result = await reviewMemberDocument({
      memberId: 'm1', documentType: 'PAN', decision: 'REJECTED', reason: 'The scan is blurred and unreadable.', actorUserId: 'admin-1',
    });
    expect(prismaMock.memberDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'The scan is blurred and unreadable.' }) }),
    );
    expect(result).not.toHaveProperty('numberHash');
    expect(result).not.toHaveProperty('numberEncrypted');
  });

  it('requires a reason to reject', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'SUBMITTED', vendorId: 'm1' });
    await expect(
      reviewMemberDocument({ memberId: 'm1', documentType: 'PAN', decision: 'REJECTED', actorUserId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a reason longer than 500 characters', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'SUBMITTED', vendorId: 'm1' });
    await expect(
      reviewMemberDocument({ memberId: 'm1', documentType: 'PAN', decision: 'REJECTED', reason: 'x'.repeat(501), actorUserId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prismaMock.memberDocument.update).not.toHaveBeenCalled();
  });

  it('409 when the document is not waiting for review', async () => {
    prismaMock.memberDocument.findUnique.mockResolvedValue({ id: 'd1', status: 'APPROVED', vendorId: 'm1' });
    await expect(
      reviewMemberDocument({ memberId: 'm1', documentType: 'PAN', decision: 'APPROVED', actorUserId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
