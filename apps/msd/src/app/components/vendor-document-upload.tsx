import { useEffect, useRef, useState } from 'react';
import { OutlinedButton, Icon, LinearProgress } from '@skylabs-monorepo/shared-ui/react';
import {
  uploadMyKycDocument,
  deleteMyKycDocument,
  uploadVendorKycDocument,
  deleteVendorKycDocument,
  type VendorDocument,
  type VendorDocumentType,
} from '../../api/rbac/vendors';
import { ApiRequestError } from '../../api/rbac/client';
import { resolveMediaUrl } from '../../api/media';
import './vendor-document-upload.css';

const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * One KYC document slot (GST/PAN/Aadhaar) — real file upload (PDF/JPG/JPEG/PNG), no URL/link
 * input. Mirrors `MediaUploader`'s staging pattern (see its own doc comment): when `vendorId` is
 * null — the self-service pre-creation surface, where "Create Vendor" is the very form this
 * renders inside of — the picked file is held locally (name/size shown, nothing uploaded yet)
 * and automatically flushed the moment a real `vendorId` becomes available (right after the
 * parent's own create call resolves). The admin pipeline always has a real vendor id by the time
 * Step 1 renders (the owner-picker screen creates the draft vendor first), so it uploads
 * immediately. Exactly one file per slot — re-uploading replaces it (upsert by documentType).
 */
export function VendorDocumentUpload({
  documentType,
  label,
  vendorId,
  selfService,
  existingDocument,
  token,
  onUploaded,
  onDeleted,
  onStagedChange,
}: {
  documentType: VendorDocumentType;
  label: string;
  vendorId: string | null;
  /** Self-service (`/vendors/me/kyc-documents/...`) vs. admin-on-behalf (`/vendors/:id/kyc-documents/...`). */
  selfService: boolean;
  existingDocument?: VendorDocument;
  token: string | null;
  onUploaded?: (doc: VendorDocument) => void;
  onDeleted?: () => void;
  /** Reports whether this slot currently has a file — staged (pre-creation) or really uploaded
   *  — so the parent form can compute "at least one KYC document" across all three slots. */
  onStagedChange?: (hasFile: boolean) => void;
}) {
  const [document, setDocument] = useState<VendorDocument | undefined>(existingDocument);
  const [staged, setStaged] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const previousVendorId = useRef(vendorId);

  useEffect(() => {
    setDocument(existingDocument);
  }, [existingDocument]);

  useEffect(() => {
    onStagedChange?.(Boolean(document || staged));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, staged]);

  // The moment a real vendorId becomes available (the parent form's own create call resolved),
  // flush whatever was picked before that point — same "stage then flush" pattern as
  // MediaUploader's flushStaged.
  useEffect(() => {
    if (!previousVendorId.current && vendorId && staged) {
      void doUpload(staged, vendorId);
    }
    previousVendorId.current = vendorId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  function describeError(err: unknown): string {
    return err instanceof ApiRequestError ? err.message : 'Upload failed.';
  }

  async function doUpload(file: File, readyVendorId: string) {
    setBusy(true);
    setError('');
    try {
      const { data } = selfService
        ? await uploadMyKycDocument(token, documentType, file, file.name)
        : await uploadVendorKycDocument(token, readyVendorId, documentType, file, file.name);
      setDocument(data);
      setStaged(null);
      onUploaded?.(data);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleFileSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    const file = files[0];
    const isAllowedType = /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!isAllowedType) {
      setError('Only PDF, JPG, JPEG, or PNG files are allowed.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (file.size > DOCUMENT_MAX_BYTES) {
      setError('File size must not exceed 5 MB.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    if (!vendorId) {
      setStaged(file);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    void doUpload(file, vendorId);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove() {
    setError('');
    if (!document) {
      // Only a staged (not-yet-uploaded) file — just drop it locally.
      setStaged(null);
      return;
    }
    if (!vendorId) return;
    setBusy(true);
    try {
      if (selfService) {
        await deleteMyKycDocument(token, documentType);
      } else {
        await deleteVendorKycDocument(token, vendorId, documentType);
      }
      setDocument(undefined);
      onDeleted?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const filename = document?.originalFilename ?? staged?.name;
  const sizeBytes = document?.sizeBytes ?? staged?.size;

  return (
    <div className="vendor-document-upload">
      <p className="vendor-document-upload__label">{label}</p>
      {busy && <LinearProgress indeterminate />}
      {filename ? (
        <div className="vendor-document-upload__file">
          <Icon aria-hidden="true">description</Icon>
          <div className="vendor-document-upload__file-info">
            <span className="vendor-document-upload__filename">{filename}</span>
            <span className="vendor-document-upload__filesize">
              {sizeBytes != null ? `${Math.round(sizeBytes / 1024)} KB` : ''}
              {staged && !document && ' — will upload on save'}
              {document && ' — uploaded'}
            </span>
          </div>
          {document && (
            // Same link serves both "View" (self-service) and Superadmin's "View/Download" KYC
            // review requirement — a same-tab open lets the browser handle PDF preview or
            // download per its own MIME handling, matching every other media link in this app.
            <OutlinedButton href={resolveMediaUrl(document.storageKey)} target="_blank" rel="noreferrer">
              <Icon slot="icon" aria-hidden="true">visibility</Icon>
              View
            </OutlinedButton>
          )}
          <OutlinedButton onClick={() => inputRef.current?.click()} disabled={busy}>
            <Icon slot="icon" aria-hidden="true">upload_file</Icon>
            Replace
          </OutlinedButton>
          <OutlinedButton onClick={remove} disabled={busy}>
            <Icon slot="icon" aria-hidden="true">delete</Icon>
            Remove
          </OutlinedButton>
        </div>
      ) : (
        <OutlinedButton onClick={() => inputRef.current?.click()} disabled={busy}>
          <Icon slot="icon" aria-hidden="true">upload_file</Icon>
          Upload {label}
        </OutlinedButton>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        hidden
        onChange={(e) => handleFileSelected(e.target.files)}
      />
      <p className="field-hint">PDF, JPG, JPEG, or PNG — up to 5 MB.</p>
      {error && <p className="error-state" role="alert">{error}</p>}
    </div>
  );
}

export default VendorDocumentUpload;
