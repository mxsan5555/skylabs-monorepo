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
  categorySlug: 'wellness',
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

function renderDialog(props: { post?: BlogPost; onSave: (input: unknown) => Promise<BlogPost | void> }) {
  function Harness() {
    const dialogRef = useRef<MdDialog>(null);
    return (
      <ToastProvider>
        <BlogFormDialog dialogRef={dialogRef} token="tok" post={props.post} onSave={props.onSave} />
      </ToastProvider>
    );
  }
  return render(<Harness />);
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
        categorySlug: existingPost.categorySlug,
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
});
