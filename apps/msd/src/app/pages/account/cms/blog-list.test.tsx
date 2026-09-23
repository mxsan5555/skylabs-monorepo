import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { BlogPost } from '../../../../api/rbac/blog-posts';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listBlogPostsMock = vi.fn();
const createBlogPostMock = vi.fn();
const updateBlogPostMock = vi.fn();
const setBlogPostStatusMock = vi.fn();
const deleteBlogPostMock = vi.fn();
// BlogList fetches the category picker options once on mount (see its own `useEffect`) — mocked
// to an empty resolved list so this file's tests don't need real category fixtures.
const listBlogCategoriesMock = vi.fn();

vi.mock('../../../../api/rbac/blog-posts', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/blog-posts')>('../../../../api/rbac/blog-posts');
  return {
    ...actual,
    listBlogPosts: (...args: unknown[]) => listBlogPostsMock(...args),
    createBlogPost: (...args: unknown[]) => createBlogPostMock(...args),
    updateBlogPost: (...args: unknown[]) => updateBlogPostMock(...args),
    setBlogPostStatus: (...args: unknown[]) => setBlogPostStatusMock(...args),
    deleteBlogPost: (...args: unknown[]) => deleteBlogPostMock(...args),
  };
});

vi.mock('../../../../api/rbac/blog-categories', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/blog-categories')>('../../../../api/rbac/blog-categories');
  return {
    ...actual,
    listBlogCategories: (...args: unknown[]) => listBlogCategoriesMock(...args),
  };
});

// BlogFormDialog (mounted for both Add + Edit regardless of open state) renders MediaUploader,
// which hits the media API on its own — mocked the same way media-uploader.test.tsx does.
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

import { BlogList } from './blog-list';

const POST: BlogPost = {
  id: 'post-1',
  title: 'Deep Tissue Massage Benefits',
  slug: 'deep-tissue-massage-benefits',
  excerpt: 'Everything you need to know.',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Wellness', slug: 'wellness' },
  body: [{ type: 'paragraph', text: 'Hello world' }],
  author: 'Jane Doe',
  readMinutes: 4,
  tags: ['wellness'],
  status: 'DRAFT',
  publishedAt: null,
  metaTitle: null,
  metaDescription: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  mediaImages: [],
};

function renderList() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <BlogList />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** `sky-data-table` never gets custom-element-upgraded in this unit test's module graph (its
 *  registration side effect only happens app-wide, e.g. `main.tsx`) — same convention as
 *  `categories.test.tsx`'s `waitForTableLoaded`. The `listBlogPosts` promise resolving is
 *  genuinely asynchronous, so wait for the table's `total` attribute rather than just the mock
 *  having been *called* (which happens synchronously, before the promise settles). */
async function waitForTableLoaded(expectedTotal: number): Promise<void> {
  await waitFor(() => {
    const table = document.querySelector('sky-data-table');
    expect(table?.getAttribute('total')).toBe(String(expectedTotal));
  });
}

function table(): HTMLElement {
  const el = document.querySelector('sky-data-table');
  if (!el) throw new Error('sky-data-table not found');
  return el as HTMLElement;
}

function dispatchRowAction(action: string, rowIndex = 0): void {
  fireEvent(table(), new CustomEvent('sky-dt-row-action', { detail: { action, row: {}, rowIndex } }));
}

/**
 * `dispatchRowAction` fires the row-action event immediately after `waitForTableLoaded` resolves
 * — but that helper only waits for the `total` DOM attribute (reflecting the just-committed
 * render) to update, not for BlogList's own row-action `useEffect` (keyed on `[posts]`) to have
 * re-subscribed its listener with the now-populated `posts` closure. Under real browser paint
 * timing a user physically cannot click a row before that effect settles; under jsdom + RTL's
 * `waitFor` (which polls with real timers, decoupled from React's own commit/effect scheduling)
 * the two can race, so the very first dispatch can land on a listener whose `posts` closure is
 * still `[]` and silently no-ops. Retrying the dispatch inside `waitFor` — instead of dispatching
 * once and only polling the assertion — self-heals once the effect catches up; extra dispatches
 * to an already-correct listener are harmless (the mocked handlers are idempotent no-ops beyond
 * recording the call).
 */
async function dispatchRowActionUntil(action: string, assert: () => void, rowIndex = 0): Promise<void> {
  await waitFor(() => {
    dispatchRowAction(action, rowIndex);
    assert();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['cms.blog.pages:create', 'cms.blog.pages:edit', 'cms.blog.pages:delete']);
  listBlogPostsMock.mockResolvedValue({ data: [POST], meta: { total: 1 } });
  listBlogCategoriesMock.mockResolvedValue({ data: [{ id: 'cat-1', name: 'Wellness', slug: 'wellness', description: '', isActive: true, sortOrder: 0, createdAt: '', updatedAt: '' }] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Feature: Blog Posts admin list
 * Scenario: renders rows from the API, wires row actions (edit/publish-toggle/delete) to their
 * matching API calls, and hides edit/delete actions (and the "New blog post" button) when the
 * caller lacks the matching `cms.blog` permission.
 *
 * Given: a mocked `listBlogPosts` response
 * When: the admin views the list, edits, toggles status, or deletes a row
 * Then: the table reflects the fetched rows, and each row action calls its matching API function
 *
 * Edge cases:
 * - deleting without confirming `window.confirm` never calls `deleteBlogPost`
 * - a caller with no create/edit/delete permission sees no "New blog post" button and only a
 *   "View" row action
 */
describe('BlogList', () => {
  it('renders rows from the mocked listBlogPosts response', async () => {
    renderList();
    await waitForTableLoaded(1);
    expect(listBlogPostsMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ page: 1, pageSize: 10 }));
    expect(table().getAttribute('rows')).toContain('Deep Tissue Massage Benefits');
  });

  it('fetches the category picker options via listBlogCategories() on mount and renders the row\'s category name (from the post\'s category relation, not a hardcoded slug)', async () => {
    renderList();
    await waitForTableLoaded(1);

    expect(listBlogCategoriesMock).toHaveBeenCalledWith('test-token', { pageSize: 100 });
    expect(table().getAttribute('rows')).toContain('Wellness');
  });

  it('renders "—" in the Category column for a post with no resolved category relation (empty state)', async () => {
    listBlogPostsMock.mockResolvedValue({ data: [{ ...POST, category: undefined }], meta: { total: 1 } });
    renderList();
    await waitForTableLoaded(1);

    const rows = JSON.parse(table().getAttribute('rows') ?? '[]') as { Category: string }[];
    expect(rows[0].Category).toBe('—');
  });

  it('edit opens the dialog pre-filled — Save resubmits the row\'s own fields via updateBlogPost', async () => {
    updateBlogPostMock.mockResolvedValue({ data: { ...POST, title: 'Deep Tissue Massage Benefits' } });
    renderList();
    await waitForTableLoaded(1);

    // The Edit dialog's key changes from 'edit-empty' to the post id once editingPost is set,
    // remounting BlogFormDialog with `post={editingPost}` — its headline flips from "New blog
    // post" to "Edit blog post" once that happens. Dispatch is retried (see
    // `dispatchRowActionUntil`'s doc comment) since the row-action listener may not yet be
    // subscribed with the loaded post the first time this poll runs.
    await dispatchRowActionUntil('edit', () => {
      const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit blog post'));
      if (!dialog) throw new Error('Edit dialog not yet showing the pre-filled post');
    });
    const editDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit blog post'))!;
    const editSaveButton = editDialog.querySelector('md-filled-button') as HTMLElement;
    fireEvent.click(editSaveButton);

    await waitFor(() => expect(updateBlogPostMock).toHaveBeenCalledOnce());
    const [token, id, payload] = updateBlogPostMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(id).toBe(POST.id);
    expect(payload).toEqual(expect.objectContaining({ title: POST.title, slug: POST.slug, author: POST.author }));
  });

  it('the publish/unpublish row action calls setBlogPostStatus with the flipped status', async () => {
    setBlogPostStatusMock.mockResolvedValue({ data: { ...POST, status: 'PUBLISHED', publishedAt: '2025-06-01T00:00:00.000Z' } });
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('toggle-status', () => {
      expect(setBlogPostStatusMock).toHaveBeenCalledWith('test-token', POST.id, 'PUBLISHED');
    });
    expect(await screen.findByText('Post published.')).toBeTruthy();
  });

  it('delete confirms via window.confirm, then calls deleteBlogPost only when confirmed', async () => {
    deleteBlogPostMock.mockResolvedValue({ data: null });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('delete', () => {
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining(POST.title));
    });
    await waitFor(() => expect(deleteBlogPostMock).toHaveBeenCalledWith('test-token', POST.id));
    expect(await screen.findByText('Blog post deleted.')).toBeTruthy();
  });

  it('delete does NOT call deleteBlogPost when window.confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderList();
    await waitForTableLoaded(1);

    // Confirms the row-action listener genuinely ran (not just that deleteBlogPost happens to
    // have never been called, which would trivially — and misleadingly — pass even if the
    // dispatch never reached a listener at all).
    await dispatchRowActionUntil('delete', () => {
      expect(confirmSpy).toHaveBeenCalled();
    });

    // Give any (incorrect) async delete call a chance to fire before asserting it never did.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteBlogPostMock).not.toHaveBeenCalled();
  });

  it('hides "New blog post" and gates edit/publish/delete row actions when the caller has no cms.blog create/edit/delete permission', async () => {
    grantedPermissions = new Set(); // view-only
    renderList();
    await waitForTableLoaded(1);

    expect(screen.queryByText('New blog post')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions.map((a) => a.event)).toEqual(['view']);
  });
});
