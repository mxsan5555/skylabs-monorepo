import { prisma } from '../lib/prisma';
import { deleteMediaFile, writeMediaFile } from '../lib/media-storage';
import { validateMediaFile } from './media-validation.service';
import { ApiError } from '../lib/http';
import { Prisma } from '../generated/prisma-client';
import {
  isValidDocumentNumber,
  maskDocumentNumber,
  normalizeDocumentNumber,
  type DocumentTypeKey,
} from '../lib/document-number';
import { encryptField, hashDocumentNumber } from '../lib/field-crypto';
import { REASON_MAX, REASON_MIN } from './member-status-machine';
import type { MediaFile } from './media.service';

const STORAGE_SUBDIR = 'vendor-documents';
export const REQUIRED_DOCUMENT_TYPES: readonly DocumentTypeKey[] = ['AADHAAR', 'PAN', 'GST'];
const PROVIDED_STATUSES = ['SUBMITTED', 'APPROVED'];
const NUMBER_IN_USE_MESSAGE = 'This document number already belongs to another member.';

export interface DocumentsSummary {
  complete: boolean;
  missing: DocumentTypeKey[];
  rejected: DocumentTypeKey[];
  dueAt: Date | null;
  overdue: boolean;
}

/** Pure. "Complete" means all three types are provided (submitted or approved). */
export function documentsSummary(
  docs: { documentType: string; status: string }[],
  dueAt: Date | null,
  now: Date = new Date(),
): DocumentsSummary {
  const byType = new Map(docs.map((d) => [d.documentType, d.status]));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !byType.has(t));
  const rejected = REQUIRED_DOCUMENT_TYPES.filter((t) => byType.get(t) === 'REJECTED' || byType.get(t) === 'EXPIRED');
  const complete = REQUIRED_DOCUMENT_TYPES.every((t) => PROVIDED_STATUSES.includes(byType.get(t) ?? ''));
  return { complete, missing, rejected, dueAt, overdue: !complete && dueAt !== null && dueAt.getTime() < now.getTime() };
}

type DocumentRow = Partial<Prisma.MemberDocumentGetPayload<Record<string, never>>>;

/**
 * The API shape. Hash and ciphertext never leave the server: this picks fields by name, so a
 * new column stays private until someone adds it here. File keys are returned only when
 * `includeFiles` is true (viewers with members:edit or members:approve, or the member itself),
 * and so is the masked number. Support and Marketing see the type and the status only.
 */
export function toDocumentView(row: DocumentRow, opts: { includeFiles: boolean }) {
  return {
    id: row.id,
    documentType: row.documentType,
    status: row.status,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt,
    uploadedOnBehalf: row.uploadedOnBehalf,
    uploadedByUserId: row.uploadedByUserId,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(opts.includeFiles
      ? { numberMasked: row.numberMasked, storageKey: row.storageKey, originalFilename: row.originalFilename, mimeType: row.mimeType, sizeBytes: row.sizeBytes }
      : {}),
  };
}

export async function listMemberDocuments(memberId: string, opts: { includeFiles: boolean }) {
  const rows = await prisma.memberDocument.findMany({ where: { vendorId: memberId }, orderBy: { documentType: 'asc' } });
  return rows.map((row) => toDocumentView(row, opts));
}

export interface UploadInput {
  memberId: string;
  documentType: DocumentTypeKey;
  file: MediaFile;
  /** The typed number. Optional: a file alone is still accepted, the checklist then shows no number. */
  number?: string;
  actorUserId: string;
  /** True when staff upload for the member. */
  onBehalf: boolean;
}

const DOCUMENT_LABEL: Record<DocumentTypeKey, string> = { GST: 'GST', PAN: 'PAN', AADHAAR: 'Aadhaar' };

function isNumberHashConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
  return fields.some((f) => f.includes('numberHash'));
}

/** Returns the stored document without hash or ciphertext, file fields included (the uploader may open it). */
export async function uploadMemberDocument(input: UploadInput) {
  const { memberId, documentType } = input;

  // No number on this upload: clear any number the previous file carried, so it never outlives its file.
  let numberFields: { numberMasked: string | null; numberHash: string | null; numberEncrypted: string | null } = {
    numberMasked: null,
    numberHash: null,
    numberEncrypted: null,
  };
  if (input.number && input.number.trim()) {
    const normalized = normalizeDocumentNumber(documentType, input.number);
    if (!isValidDocumentNumber(documentType, normalized)) {
      throw new ApiError('VALIDATION_ERROR', 'Enter a valid document number.', {
        fields: { number: `Enter a valid ${DOCUMENT_LABEL[documentType]} number.` },
      });
    }
    // A null hash means no pepper in development: the duplicate check is skipped.
    const numberHash = hashDocumentNumber(documentType, normalized);
    if (numberHash) {
      const taken = await prisma.memberDocument.findFirst({
        where: { documentType, numberHash, vendorId: { not: memberId } },
        select: { id: true },
      });
      if (taken) throw new ApiError('DOCUMENT_NUMBER_IN_USE', NUMBER_IN_USE_MESSAGE);
    }
    numberFields = {
      numberMasked: maskDocumentNumber(documentType, normalized),
      numberHash,
      numberEncrypted: encryptField(normalized),
    };
  }

  const validated = validateMediaFile(input.file.buffer, 'document');
  const existing = await prisma.memberDocument.findUnique({
    where: { vendorId_documentType: { vendorId: memberId, documentType } },
  });
  const { storageKey, sizeBytes } = await writeMediaFile(STORAGE_SUBDIR, memberId, input.file.buffer, validated.extension);

  const fileFields = {
    storageKey,
    originalFilename: input.file.originalname || null,
    mimeType: validated.sniffedType,
    sizeBytes,
  };
  const provenance = { uploadedByUserId: input.actorUserId || null, uploadedOnBehalf: input.onBehalf };
  // A re-upload always goes back to review, even when it was approved or rejected before.
  const reset = { status: 'SUBMITTED' as const, rejectionReason: null, reviewedAt: null, reviewedByUserId: null };

  let upserted;
  try {
    upserted = await prisma.memberDocument.upsert({
      where: { vendorId_documentType: { vendorId: memberId, documentType } },
      create: { vendorId: memberId, documentType, ...fileFields, ...provenance, ...reset, ...numberFields },
      update: { ...fileFields, ...provenance, ...reset, ...numberFields },
    });
  } catch (err) {
    // The DB never got the new storageKey, so the just-written file is orphaned and safe to remove.
    await deleteMediaFile(storageKey);
    // A concurrent upload of the same number lost the race on [documentType, numberHash].
    if (isNumberHashConflict(err)) throw new ApiError('DOCUMENT_NUMBER_IN_USE', NUMBER_IN_USE_MESSAGE);
    throw err;
  }

  // The upsert committed. Failing to delete the old file must not roll back the new pointer.
  if (existing) {
    try {
      await deleteMediaFile(existing.storageKey);
    } catch (err) {
      console.error({ err, context: 'uploadMemberDocument: failed to delete old file', memberId, documentType });
    }
  }
  return toDocumentView(upserted, { includeFiles: true });
}

export async function deleteMemberDocument(memberId: string, documentType: DocumentTypeKey) {
  const existing = await prisma.memberDocument.findUnique({
    where: { vendorId_documentType: { vendorId: memberId, documentType } },
  });
  if (!existing) throw new ApiError('NOT_FOUND', 'Document not found');
  if (existing.status === 'APPROVED') {
    throw new ApiError('CONFLICT', 'An approved document cannot be removed. Upload a new file to replace it.');
  }
  await prisma.memberDocument.delete({ where: { id: existing.id } });
  await deleteMediaFile(existing.storageKey);
}

export interface ReviewInput {
  memberId: string;
  documentType: DocumentTypeKey;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string;
  actorUserId: string;
}

/** The only writer of reviewedByUserId and reviewedAt. Returns the document without hash or ciphertext. */
export async function reviewMemberDocument(input: ReviewInput) {
  const doc = await prisma.memberDocument.findUnique({
    where: { vendorId_documentType: { vendorId: input.memberId, documentType: input.documentType } },
  });
  if (!doc) throw new ApiError('NOT_FOUND', 'Document not found');
  if (doc.status !== 'SUBMITTED') {
    throw new ApiError('CONFLICT', 'Only a submitted document can be approved or rejected.');
  }
  const reason = (input.reason ?? '').trim();
  if (input.decision === 'REJECTED' && (reason.length < REASON_MIN || reason.length > REASON_MAX)) {
    throw new ApiError('VALIDATION_ERROR', `Enter a rejection reason of ${REASON_MIN} to ${REASON_MAX} characters.`, {
      fields: { reason: `Use ${REASON_MIN} to ${REASON_MAX} characters.` },
    });
  }
  const updated = await prisma.memberDocument.update({
    where: { id: doc.id },
    data: {
      status: input.decision,
      rejectionReason: input.decision === 'REJECTED' ? reason : null,
      reviewedByUserId: input.actorUserId,
      reviewedAt: new Date(),
    },
  });
  return toDocumentView(updated, { includeFiles: true });
}

/* Wrappers keep the member self-service list and delete routes (/vendors/me/kyc-documents) unchanged. */
export async function listVendorDocuments(vendorId: string) {
  return listMemberDocuments(vendorId, { includeFiles: true });
}

export async function deleteVendorDocument(vendorId: string, documentType: DocumentTypeKey) {
  return deleteMemberDocument(vendorId, documentType);
}
