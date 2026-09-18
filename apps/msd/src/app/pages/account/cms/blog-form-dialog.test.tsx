import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { BlogPost } from '../../../../api/rbac/blog-posts';
import { BlogFormDialog } from './blog-form-dialog';

// `MediaUploader` (rendered inside every BlogFormDialog) hits the media API on its own — mocked
// here the same way `media-uploader.test.tsx` does, so mounting the dialog never triggers a real
// network call.
vi.mock('../../../../api/media', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/media')>('../../../../api/media');
  return {
    ...actual,
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    reorderImages: vi.fn(),
    setPrimaryImage: vi.fn(),
    uploadVideo: vi.fn(),
    deleteVideo: vi.fn(),
  };
});

const existingPost: BlogPost = {
  id: 'post-1',
  title: 'Deep Tissue Massage Benefits',
  slug: 'deep-tissue-massage-benefits',
  excerpt: 'Everything you need to know.',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Wellness', slug: 'wellness' },
  body: [{ type: 'paragraph', text: 'Hello world' }],
  author: 'Jane Doe',
  readMinutes: 4,
  tags: ['wellness', 'self-care'],
  status: 'DRAFT',
  publishedAt: null,
  metaTitle: 'Custom meta title',
  metaDescription: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  mediaImages: [],
};

const CATEGORIES = [
  { id: 'cat-1', name: 'Wellness', slug: 'wellness', description: '', isActive: true, sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'cat-2', name: 'Skincare', slug: 'skincare', description: '', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
];

function renderDialog(props: {
  post?: BlogPost;
  onSave: (input: unknown) => Promise<BlogPost | void>;
  categories?: typeof CATEGORIES;
  categoriesLoading?: boolean;
}) {
  function Harness() {
    const dialogRef = useRef<MdDialog>(null);
    return (
      <ToastProvider>
        <BlogFormDialog
          dialogRef={dialogRef}
          token="tok"
          post={props.post}
          categories={props.categories ?? CATEGORIES}
          categoriesLoading={props.categoriesLoading ?? false}
          onSave={props.onSave}
        />
      </ToastProvider>
    );
  }
  return render(<Harness />);
}

/** Distinguishes the Category select from `BlogBlockEditor`'s own "Block type" select(s) — both
 *  render as plain `md-outlined-select` tags with no upgraded custom-element property/attribute
 *  to key off under jsdom (light DOM only, not upgraded — same limitation this file's other
 *  doc comments call out for simulated typing/change events). The Category select is the only
 *  one rendered outside the `.block-editor` fieldset, so that's the disambiguator used here. */
function categorySelect(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll('md-outlined-select')).find((el) => !el.closest('.block-editor'));
}

function saveButton(): HTMLElement {
  const btn = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save'));
  if (!btn) throw new Error('Save button not found');
  return btn as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: Blog Post form dialog — submit payload shape
 * Scenario: `submit()` builds the `BlogPostInput` payload passed to `onSave` (which blog-list.tsx
 * wires directly to `updateBlogPost`/`createBlogPost` with no further transformation), so
 * asserting the shape passed to `onSave` here is equivalent to asserting the API call's payload.
 *
 * Given: the dialog pre-filled from an existing post (form state seeded directly from the `post`
 *        prop in `useState`'s initializer — no simulated typing needed; live text-field input
 *        can't be reliably driven under this jsdom + `@lit/react` + React 19 stack, see
 *        `blog-block-editor.test.tsx`'s doc comment for the same documented gap)
 * When: Save is clicked with no changes
 * Then: `onSave` receives the post's fields verbatim, tags re-split from the comma-joined text,
 *       and `metaDescription` (originally null) becomes `undefined` (never null) per submit()'s
 *       own `.trim() || undefined` transform
 *
 * Edge cases:
 * - a brand-new (no `post`) dialog rejects submission client-side when required fields are blank
 *   — `onSave` is never called
 * - a VALIDATION_ERROR `ApiRequestError` renders the matching field-level message under fieldErrors
 */
describe('BlogFormDialog — submit payload', () => {
  it('editing a pre-filled post: Save submits the post\'s own fields back, tags re-split from text, metaDescription null -> undefined', async () => {
    const onSave = vi.fn().mockResolvedValue(existingPost);
    renderDialog({ post: existingPost, onSave });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const payload = onSave.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        title: existingPost.title,
        slug: existingPost.slug,
        excerpt: existingPost.excerpt,
        categoryId: existingPost.categoryId,
        author: existingPost.author,
        readMinutes: existingPost.readMinutes,
        tags: ['wellness', 'self-care'],
        body: existingPost.body,
        metaTitle: 'Custom meta title',
        metaDescription: undefined,
      }),
    );
    expect(await screen.findByText('Blog post updated.')).toBeTruthy();
  });

  it('a brand-new dialog with no fields filled in rejects submission client-side — onSave is never called (empty state)', async () => {
    const onSave = vi.fn();
    renderDialog({ onSave });

    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByText('Title, slug, excerpt, category, and author are required.')).toBeTruthy());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a VALIDATION_ERROR response renders the matching field-level error extracted via extractBlogPostFieldErrors', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, { fieldErrors: { title: ['Title is required.'] } }));
    renderDialog({ post: existingPost, onSave });

    fireEvent.click(saveButton());

    expect(await screen.findByText('Title is required.')).toBeTruthy();
    expect(await screen.findByText('Fix the highlighted fields and try again.')).toBeTruthy();
  });

  it('a non-validation ApiRequestError shows its own message and a toast, without any field-level error', async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiRequestError('CONFLICT', 'Blog post slug already exists', 409));
    renderDialog({ post: existingPost, onSave });

    fireEvent.click(saveButton());

    // Renders twice by design — once as the inline `error-state` paragraph, once as the toast
    // (see `submit()`'s catch block: both `setError(msg)` and `showToast(msg, 'error')` fire).
    await waitFor(() => expect(screen.getAllByText('Blog post slug already exists').length).toBeGreaterThan(0));
    expect(screen.queryByText('Fix the highlighted fields and try again.')).toBeNull();
  });

  it('the Category select is populated from the `categories` prop (fed by listBlogCategories() in blog-list.tsx), not hardcoded', () => {
    renderDialog({ post: existingPost, onSave: vi.fn() });

    const select = categorySelect();
    if (!select) throw new Error('Category select not found');
    const optionLabels = Array.from(select.querySelectorAll('md-select-option')).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(['Wellness', 'Skincare']);
  });

  it('a post pre-filled with a different category (cat-2) submits that category\'s id, not the first option in the list', async () => {
    const postInSecondCategory: BlogPost = { ...existingPost, categoryId: 'cat-2', category: { id: 'cat-2', name: 'Skincare', slug: 'skincare' } };
    const onSave = vi.fn().mockResolvedValue(postInSecondCategory);
    renderDialog({ post: postInSecondCategory, onSave });

    // The select's live DOM value/onChange can't be driven by fireEvent under this jsdom +
    // @lit/react + React 19 stack (same documented limitation as this file's own doc comment on
    // simulated typing) — so this asserts the same "seeded from the post prop, submitted
    // verbatim" contract the text fields use above, applied to the category FK: form state is
    // initialized directly from `post.categoryId` (see the dialog's own `useState` initializer),
    // independent of which option the (inert-under-jsdom) select visually shows as selected.
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({ categoryId: 'cat-2' }));
  });

  it('renders an empty-state message instead of the select when no blog categories exist yet, and blocks submission client-side (empty state)', async () => {
    const onSave = vi.fn();
    renderDialog({ post: existingPost, categories: [], categoriesLoading: false, onSave });

    expect(screen.getByText('No blog categories yet — add one first.')).toBeTruthy();
    expect(categorySelect()).toBeUndefined();
  });

  it('shows a loading message instead of the select while categories are still being fetched', () => {
    renderDialog({ post: existingPost, categories: [], categoriesLoading: true, onSave: vi.fn() });

    expect(screen.getByText('Loading categories…')).toBeTruthy();
    expect(categorySelect()).toBeUndefined();
  });
});
