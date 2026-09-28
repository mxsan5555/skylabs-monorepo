import { useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { BlogCategory, BlogCategoryInput } from '../../../../api/rbac/blog-categories';
import { extractBlogCategoryFieldErrors, type BlogCategoryFieldKey } from './field-errors';

/** lower-kebab-case, matching msd-api's `slugString` validator exactly. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Create/edit dialog for a Blog Category — mirrors `faq-form-dialog.tsx` structurally
 *  (`submittingRef` double-submit guard, per-field errors under each input). `slug` auto-fills
 *  from `name` via `slugify()` until the user edits the slug field directly (tracked by
 *  `slugDirtyRef`), then stays fully editable/independent from then on. */
export function BlogCategoryFormDialog({
  dialogRef,
  category,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  category?: BlogCategory;
  onSave: (input: BlogCategoryInput) => Promise<BlogCategory | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<BlogCategoryInput>({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    sortOrder: category?.sortOrder ?? 0,
    isActive: category?.isActive ?? true,
  });
  const slugDirtyRef = useRef(Boolean(category));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BlogCategoryFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const setName = (name: string) => {
    setForm((f) => ({ ...f, name, slug: slugDirtyRef.current ? f.slug : slugify(name) }));
  };

  const setSlug = (slug: string) => {
    slugDirtyRef.current = true;
    setForm((f) => ({ ...f, slug }));
  };

  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    setFieldErrors(null);
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractBlogCategoryFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save blog category.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{category ? 'Edit blog category' : 'New blog category'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Name"
          required
          value={form.name}
          onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.name)}
        />
        {fieldErrors?.name && <p className="error-state" role="alert">{fieldErrors.name}</p>}

        <OutlinedTextField
          label="Slug"
          required
          value={form.slug}
          onInput={(e: Event) => setSlug((e.target as HTMLInputElement).value)}
          error={Boolean(fieldErrors?.slug)}
        />
        <p className="field-hint">Auto-generated from the name — edit it directly to override.</p>
        {fieldErrors?.slug && <p className="error-state" role="alert">{fieldErrors.slug}</p>}

        <OutlinedTextField
          label="Description"
          type="textarea"
          rows={3}
          value={form.description ?? ''}
          onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))}
          error={Boolean(fieldErrors?.description)}
        />
        {fieldErrors?.description && <p className="error-state" role="alert">{fieldErrors.description}</p>}

        <OutlinedTextField
          label="Sort order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
          error={Boolean(fieldErrors?.sortOrder)}
        />
        {fieldErrors?.sortOrder && <p className="error-state" role="alert">{fieldErrors.sortOrder}</p>}

        <label className="widget-assign-row__label">
          <input
            type="checkbox"
            checked={form.isActive ?? true}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          Active
        </label>

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

export default BlogCategoryFormDialog;
