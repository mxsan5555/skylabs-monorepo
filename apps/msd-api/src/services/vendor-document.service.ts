import { prisma } from '../lib/prisma';
import { deleteMediaFile, writeMediaFile } from '../lib/media-storage';
import { validateMediaFile } from './media-validation.service';
import { ApiError } from '../lib/http';
import type { VendorDocumentType } from '../generated/prisma-client';
import type { MediaFile } from './media.service';

const STORAGE_SUBDIR = 'vendor-documents';

/**
 * Real KYC file upload (GST/PAN/Aadhaar) — one row per `(vendorId, documentType)`, replacing the
 * deprecated `Vendor.gstNumber`/`panNumber`/`kycDocuments` pasted-text/URL fields. Not part of
 * `media.service.ts`'s image/video adapter map — a KYC document has no primary/sortOrder/
 * multi-per-entity concept, just one active file per type, upserted on re-upload ("Replace").
 */
export async function listVendorDocuments(vendorId: string) {
  return prisma.vendorDocument.findMany({ where: { vendorId }, orderBy: { documentType: 'asc' } });
}

export async function uploadVendorDocument(vendorId: string, documentType: VendorDocumentType, file: MediaFile) {
  const validated = validateMediaFile(file.buffer, 'document');
  const existing = await prisma.vendorDocument.findUnique({
    where: { vendorId_documentType: { vendorId, documentType } },
  });
  const { storageKey, sizeBytes } = await writeMediaFile(STORAGE_SUBDIR, vendorId, file.buffer, validated.extension);

  let upserted;
  try {
    upserted = await prisma.vendorDocument.upsert({
      where: { vendorId_documentType: { vendorId, documentType } },
      create: {
        vendorId,
        documentType,
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
    // file is genuinely orphaned and safe to clean up (same rollback-safety pattern as
    // media.service.ts#replaceVideo).
    await deleteMediaFile(storageKey);
    throw err;
  }

  // The upsert succeeded — the DB row now correctly points at the new file. A non-ENOENT failure
  // deleting the OLD file must not roll back the just-committed new pointer.
  if (existing) {
    try {
      await deleteMediaFile(existing.storageKey);
    } catch (err) {
      console.error({ err, context: 'uploadVendorDocument: failed to delete old document file', vendorId, documentType, storageKey: existing.storageKey });
    }
  }

  return upserted;
}

export async function deleteVendorDocument(vendorId: string, documentType: VendorDocumentType) {
  const existing = await prisma.vendorDocument.findUnique({
    where: { vendorId_documentType: { vendorId, documentType } },
  });
  if (!existing) throw new ApiError('NOT_FOUND', 'Document not found');
  await prisma.vendorDocument.delete({ where: { id: existing.id } });
  await deleteMediaFile(existing.storageKey);
}
