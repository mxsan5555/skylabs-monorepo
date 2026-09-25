import { useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedSelect, OutlinedTextField, SelectOption, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { BlogPost, BlogPostInput } from '../../../../api/rbac/blog-posts';
import type { BlogCategory } from '../../../../api/rbac/blog-categories';
import { MediaUploader } from '../../../components/media-uploader';
import { useToast } from '../../../../toast/toast-context';
import { BlogBlockEditor, sanitizeBlogBlocks } from './blog-block-editor';
import { extractBlogPostFieldErrors, type BlogPostFieldKey } from './field-errors';

/** Create/edit dialog for a Blog Post — mirrors `categories.tsx`'s `CategoryFormDialog`
 *  structurally: `submittingRef` double-submit guard, `savedPost` tracks the entity id
 *  `MediaUploader` uploads against (starts as the row being edited, or becomes the server's
 *  response the moment a fresh create resolves so the dialog stays open long enough for staged
 *  photos to flush), and per-field errors rendered directly under each input via
 *  `extractBlogPostFieldErrors`. */
export function BlogFormDialog({
  dialogRef,
  post,
  token,
  categories,
  categoriesLoading,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  post?: BlogPost;
  token: string | null;
  /** Populated once by `blog-list.tsx` (fetch-once-on-list-mount, shared by both the add and
   *  edit dialog instances) — a blog post's `categoryId` is a real FK now, not a free-text slug. */
  categories: BlogCategory[];
  categoriesLoading: boolean;
  onSave: (input: BlogPostInput) => Promise<BlogPost | void>;
  onClose?: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<BlogPostInput>({
    title: post?.title ?? '',
    slug: post?.slug ?? '',
    excerpt: post?.excerpt ?? '',
    categoryId: post?.categoryId ?? '',
    body: post?.body ?? [],
    author: post?.author ?? '',
    readMinutes: post?.readMinutes ?? 1,
    tags: post?.tags ?? [],
    metaTitle: post?.metaTitle ?? '',
    metaDescription: post?.metaDescription ?? '',
  });
  const [tagsText, setTagsText] = useState((post?.tags ?? []).join(', '));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BlogPostFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Checked/set synchronously at the very top of submit(), before any await — a `submitting`
  // state guard alone can't stop a second click/tap/Enter that fires before React commits the
  // disabling re-render (same double-submit gap fixed elsewhere in this file family, see
  // categories.tsx's own comment on `submittingRef`).
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);
  const [savedPost, setSavedPost] = useState<BlogPost | undefined>(post);

  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    setFieldErrors(null);
    if (!form.title.trim() || !form.slug.trim() || !form.excerpt.trim() || !form.categoryId.trim() || !form.author.trim()) {
      setError('Title, slug, excerpt, category, and author are required.');
      return;
    }
    const body = sanitizeBlogBlocks(form.body);
    if (body.length === 0) {
      setError('Add at least one content block.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    const payload: BlogPostInput = {
      ...form,
      body,
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      metaTitle: form.metaTitle?.trim() || undefined,
      metaDescription: form.metaDescription?.trim() || undefined,
    };
    try {
      const result = await onSave(payload);
      showToast(post ? 'Blog post updated.' : 'Blog post created.');
      if (!post && result) {
        // A fresh create — keep the dialog open so MediaUploader can flush any staged cover
        // photo against the new id (same pattern as CategoryFormDialog's `savedCategory`).
        setSavedPost(result);
      } else {
        dialogRef.current?.close();
      }
    } catch (err) {
      const fields = extractBlogPostFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        const msg = err instanceof ApiRequestError ? err.message : 'Could not save blog post.';
        setError(msg);
        showToast(msg, 'error');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{post ? 'Edit blog post' : 'New blog post'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Title"
          value={form.title}
          onInput={(e: Event) => setForm((f) => ({ ...f, title: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.title && <p className="error-state" role="alert">{fieldErrors.title}</p>}

        <OutlinedTextField
          label="Slug"
          value={form.slug}
          onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.slug && <p className="error-state" role="alert">{fieldErrors.slug}</p>}

        <OutlinedTextField
          label="Excerpt"
          type="textarea"
          rows={3}
          value={form.excerpt}
          onInput={(e: Event) => setForm((f) => ({ ...f, excerpt: (e.target as HTMLTextAreaElement).value }))}
        />
        {fieldErrors?.excerpt && <p className="error-state" role="alert">{fieldErrors.excerpt}</p>}

        {categoriesLoading && <p className="loading-state">Loading categories…</p>}
        {!categoriesLoading && categories.length === 0 && <p className="empty-state">No blog categories yet — add one first.</p>}
        {!categoriesLoading && categories.length > 0 && (
          <OutlinedSelect
            label="Category"
            value={form.categoryId}
            onChange={(e: Event) => setForm((f) => ({ ...f, categoryId: (e.target as HTMLSelectElement).value }))}
          >
            {categories.map((c) => (
              <SelectOption key={c.id} value={c.id}>
                <div slot="headline">{c.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>
        )}
        {fieldErrors?.categoryId && <p className="error-state" role="alert">{fieldErrors.categoryId}</p>}

        <OutlinedTextField
          label="Author"
          value={form.author}
          onInput={(e: Event) => setForm((f) => ({ ...f, author: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.author && <p className="error-state" role="alert">{fieldErrors.author}</p>}

        <OutlinedTextField
          label="Read minutes"
          type="number"
          value={String(form.readMinutes)}
          onInput={(e: Event) => setForm((f) => ({ ...f, readMinutes: Number((e.target as HTMLInputElement).value) || 1 }))}
        />
        {fieldErrors?.readMinutes && <p className="error-state" role="alert">{fieldErrors.readMinutes}</p>}

        <OutlinedTextField
          label="Tags (comma-separated)"
          value={tagsText}
          onInput={(e: Event) => setTagsText((e.target as HTMLInputElement).value)}
        />
        {fieldErrors?.tags && <p className="error-state" role="alert">{fieldErrors.tags}</p>}

        <BlogBlockEditor blocks={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))} />
        {fieldErrors?.body && <p className="error-state" role="alert">{fieldErrors.body}</p>}

        <fieldset className="form-grid">
          <legend>SEO (optional)</legend>
          <OutlinedTextField
            label="Meta title"
            value={form.metaTitle ?? ''}
            onInput={(e: Event) => setForm((f) => ({ ...f, metaTitle: (e.target as HTMLInputElement).value }))}
          />
          {fieldErrors?.metaTitle && <p className="error-state" role="alert">{fieldErrors.metaTitle}</p>}
          <OutlinedTextField
            label="Meta description"
            type="textarea"
            rows={2}
            value={form.metaDescription ?? ''}
            onInput={(e: Event) => setForm((f) => ({ ...f, metaDescription: (e.target as HTMLTextAreaElement).value }))}
          />
          {fieldErrors?.metaDescription && <p className="error-state" role="alert">{fieldErrors.metaDescription}</p>}
        </fieldset>

        <MediaUploader
          entityType="blog"
          entityId={savedPost?.id ?? null}
          existingImages={savedPost?.mediaImages ?? []}
          existingVideo={null}
          hideVideo
          token={token}
        />

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

export default BlogFormDialog;
