import { useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedSelect, OutlinedTextField, SelectOption, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { CareersJobListing, CareersJobListingInput, CareersJobStatus } from '../../../../api/rbac/careers';
import { extractCareersJobFieldErrors, type CareersJobFieldKey } from './field-errors';

const EMPLOYMENT_TYPE_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'] as const;

const STATUS_OPTIONS: { value: CareersJobStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];

/** Create/edit dialog for a Careers job listing — mirrors `blog-form-dialog.tsx` structurally
 *  (`submittingRef` double-submit guard, per-field errors under each input). Unlike Blog Post,
 *  `status` IS shown here even though msd-api's `CareersJobListingCreateSchema`/
 *  `CareersJobListingUpdateSchema` don't accept it in the main payload (status is its own
 *  `PATCH /careers/jobs/{id}/status` route) — `onSave` receives `(input, status)` and
 *  `careers.tsx`'s `saveJob` makes the extra status-route call itself only when the value
 *  actually changed, same "list's publish/unpublish toggle is a separate call" shape as Blog
 *  Post's `setBlogPostStatus`, just also reachable from this form. */
export function CareersJobFormDialog({
  dialogRef,
  job,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  job?: CareersJobListing;
  onSave: (input: CareersJobListingInput, status: CareersJobStatus) => Promise<CareersJobListing | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<CareersJobListingInput>({
    jobTitle: job?.jobTitle ?? '',
    department: job?.department ?? '',
    location: job?.location ?? '',
    employmentType: job?.employmentType ?? EMPLOYMENT_TYPE_OPTIONS[0],
    description: job?.description ?? '',
    responsibilities: job?.responsibilities ?? '',
    requirements: job?.requirements ?? '',
    applyUrl: job?.applyUrl ?? '',
    applyInstructions: job?.applyInstructions ?? '',
    sortOrder: job?.sortOrder ?? 0,
  });
  const [status, setStatus] = useState<CareersJobStatus>(job?.status ?? 'DRAFT');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CareersJobFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    setFieldErrors(null);
    if (
      !form.jobTitle.trim() ||
      !form.department.trim() ||
      !form.location.trim() ||
      !form.employmentType.trim() ||
      !form.description.trim() ||
      !form.responsibilities.trim() ||
      !form.requirements.trim()
    ) {
      setError('Job title, department, location, employment type, description, responsibilities, and requirements are required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    const payload: CareersJobListingInput = {
      ...form,
      applyUrl: form.applyUrl?.trim() || undefined,
      applyInstructions: form.applyInstructions?.trim() || undefined,
    };
    try {
      await onSave(payload, status);
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractCareersJobFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save job listing.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{job ? 'Edit job listing' : 'New job listing'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Job title"
          required
          value={form.jobTitle}
          onInput={(e: Event) => setForm((f) => ({ ...f, jobTitle: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.jobTitle)}
        />
        {fieldErrors?.jobTitle && <p className="error-state" role="alert">{fieldErrors.jobTitle}</p>}

        <OutlinedTextField
          label="Department"
          value={form.department}
          onInput={(e: Event) => setForm((f) => ({ ...f, department: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.department)}
        />
        {fieldErrors?.department && <p className="error-state" role="alert">{fieldErrors.department}</p>}

        <OutlinedTextField
          label="Location"
          value={form.location}
          onInput={(e: Event) => setForm((f) => ({ ...f, location: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.location)}
        />
        {fieldErrors?.location && <p className="error-state" role="alert">{fieldErrors.location}</p>}

        <OutlinedSelect
          label="Employment type"
          value={form.employmentType}
          onChange={(e: Event) => setForm((f) => ({ ...f, employmentType: (e.target as HTMLSelectElement).value }))}
          error={Boolean(fieldErrors?.employmentType)}
        >
          {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
            <SelectOption key={opt} value={opt}>
              <div slot="headline">{opt}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>
        {fieldErrors?.employmentType && <p className="error-state" role="alert">{fieldErrors.employmentType}</p>}

        <OutlinedTextField
          label="Description"
          type="textarea"
          rows={4}
          required
          value={form.description}
          onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))}
          error={Boolean(fieldErrors?.description)}
        />
        {fieldErrors?.description && <p className="error-state" role="alert">{fieldErrors.description}</p>}

        <OutlinedTextField
          label="Responsibilities"
          type="textarea"
          rows={4}
          value={form.responsibilities}
          onInput={(e: Event) => setForm((f) => ({ ...f, responsibilities: (e.target as HTMLTextAreaElement).value }))}
          error={Boolean(fieldErrors?.responsibilities)}
        />
        {fieldErrors?.responsibilities && <p className="error-state" role="alert">{fieldErrors.responsibilities}</p>}

        <OutlinedTextField
          label="Requirements"
          type="textarea"
          rows={4}
          value={form.requirements}
          onInput={(e: Event) => setForm((f) => ({ ...f, requirements: (e.target as HTMLTextAreaElement).value }))}
          error={Boolean(fieldErrors?.requirements)}
        />
        {fieldErrors?.requirements && <p className="error-state" role="alert">{fieldErrors.requirements}</p>}

        <OutlinedTextField
          label="Apply URL"
          type="url"
          value={form.applyUrl ?? ''}
          onInput={(e: Event) => setForm((f) => ({ ...f, applyUrl: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.applyUrl)}
        />
        {fieldErrors?.applyUrl && <p className="error-state" role="alert">{fieldErrors.applyUrl}</p>}

        <OutlinedTextField
          label="Apply instructions"
          type="textarea"
          rows={2}
          value={form.applyInstructions ?? ''}
          onInput={(e: Event) => setForm((f) => ({ ...f, applyInstructions: (e.target as HTMLTextAreaElement).value }))}
          error={Boolean(fieldErrors?.applyInstructions)}
        />
        {fieldErrors?.applyInstructions && <p className="error-state" role="alert">{fieldErrors.applyInstructions}</p>}

        <OutlinedSelect
          label="Status"
          value={status}
          onChange={(e: Event) => setStatus((e.target as HTMLSelectElement).value as CareersJobStatus)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <SelectOption key={opt.value} value={opt.value}>
              <div slot="headline">{opt.label}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>

        <OutlinedTextField
          label="Sort order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
          error={Boolean(fieldErrors?.sortOrder)}
        />
        {fieldErrors?.sortOrder && <p className="error-state" role="alert">{fieldErrors.sortOrder}</p>}

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton ref={saveButtonRef} onClick={submit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </FilledButton>
      </div>
    </Dialog>
  );
}

export default CareersJobFormDialog;
