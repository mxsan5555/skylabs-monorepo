import { useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedSelect, OutlinedTextField, SelectOption, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { WebsitePage, WebsitePageInput, WebsitePageStatus } from '../../../../api/rbac/website-pages';
import { BlogBlockEditor, sanitizeBlogBlocks } from './blog-block-editor';
import { extractWebsitePageFieldErrors, type WebsitePageFieldKey } from './field-errors';

const STATUS_OPTIONS: { value: WebsitePageStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];

/** Edit-only dialog for one of the 4 fixed legal pages — there is no create/delete concept for
 *  this resource (see `api/rbac/website-pages.ts`'s doc comment), so unlike every other CRUD
 *  dialog in this module this component never renders in a "New" mode and its `page` prop is
 *  required, not optional. `slug` is shown read-only (never editable — it's the page's stable
 *  public URL key). Reuses `BlogBlockEditor` for `content`, same as About Us's `body` field. */
export function LegalPageFormDialog({
  dialogRef,
  page,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  page: WebsitePage;
  onSave: (input: WebsitePageInput) => Promise<WebsitePage | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<WebsitePageInput>({
    title: page.title,
    content: page.content,
    status: page.status,
    metaTitle: page.metaTitle ?? '',
    metaDescription: page.metaDescription ?? '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<WebsitePageFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    setFieldErrors(null);
    if (!form.title?.trim()) {
      setError('Title is required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    const payload: WebsitePageInput = {
      ...form,
      content: sanitizeBlogBlocks(form.content ?? []),
      metaTitle: form.metaTitle?.trim() || undefined,
      metaDescription: form.metaDescription?.trim() || undefined,
    };
    try {
      await onSave(payload);
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractWebsitePageFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save legal page.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">Edit {page.title}</div>
      <div slot="content" className="form-grid">
        <p className="field-hint">Slug: {page.slug} (not editable — it's the page's public URL)</p>

        <OutlinedTextField
          label="Title"
          required
          value={form.title ?? ''}
          onInput={(e: Event) => setForm((f) => ({ ...f, title: (e.target as HTMLInputElement).value }))}
          error={Boolean(fieldErrors?.title)}
        />
        {fieldErrors?.title && <p className="error-state" role="alert">{fieldErrors.title}</p>}

        <OutlinedSelect
          label="Status"
          value={form.status ?? 'DRAFT'}
          onChange={(e: Event) => setForm((f) => ({ ...f, status: (e.target as HTMLSelectElement).value as WebsitePageStatus }))}
          error={Boolean(fieldErrors?.status)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <SelectOption key={opt.value} value={opt.value}>
              <div slot="headline">{opt.label}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>
        {fieldErrors?.status && <p className="error-state" role="alert">{fieldErrors.status}</p>}

        <BlogBlockEditor blocks={form.content ?? []} onChange={(content) => setForm((f) => ({ ...f, content }))} />
        {fieldErrors?.content && <p className="error-state" role="alert">{fieldErrors.content}</p>}

        <fieldset className="form-grid">
          <legend>SEO (optional)</legend>
          <OutlinedTextField
            label="Meta title"
            value={form.metaTitle ?? ''}
            onInput={(e: Event) => setForm((f) => ({ ...f, metaTitle: (e.target as HTMLInputElement).value }))}
            error={Boolean(fieldErrors?.metaTitle)}
          />
          {fieldErrors?.metaTitle && <p className="error-state" role="alert">{fieldErrors.metaTitle}</p>}
          <OutlinedTextField
            label="Meta description"
            type="textarea"
            rows={2}
            value={form.metaDescription ?? ''}
            onInput={(e: Event) => setForm((f) => ({ ...f, metaDescription: (e.target as HTMLTextAreaElement).value }))}
            error={Boolean(fieldErrors?.metaDescription)}
          />
          {fieldErrors?.metaDescription && <p className="error-state" role="alert">{fieldErrors.metaDescription}</p>}
        </fieldset>

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

export default LegalPageFormDialog;
