import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { BlogCategory } from '../../../../api/rbac/blog-categories';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listBlogCategoriesMock = vi.fn();
const createBlogCategoryMock = vi.fn();
const updateBlogCategoryMock = vi.fn();
const deleteBlogCategoryMock = vi.fn();

vi.mock('../../../../api/rbac/blog-categories', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/blog-categories')>('../../../../api/rbac/blog-categories');
  return {
    ...actual,
    listBlogCategories: (...args: unknown[]) => listBlogCategoriesMock(...args),
    createBlogCategory: (...args: unknown[]) => createBlogCategoryMock(...args),
    updateBlogCategory: (...args: unknown[]) => updateBlogCategoryMock(...args),
    deleteBlogCategory: (...args: unknown[]) => deleteBlogCategoryMock(...args),
  };
});

import { BlogCategoriesList } from './blog-categories-list';

const CATEGORY: BlogCategory = {
  id: 'cat-1',
  name: 'Wellness',
  slug: 'wellness',
  description: 'Wellness posts',
  isActive: true,
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderList() {
  return render(
    <ToastProvider>
      <BlogCategoriesList />
    </ToastProvider>,
  );
}

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

/** See blog-list.test.tsx's identical `dispatchRowActionUntil` doc comment — retries the dispatch
 *  until the row-action listener effect (keyed on `[categories]`) has caught up with the loaded
 *  rows, since `waitForTableLoaded` only guarantees the DOM attribute has updated, not that this
 *  effect has re-subscribed yet. */
async function dispatchRowActionUntil(action: string, assert: () => void, rowIndex = 0): Promise<void> {
  await waitFor(() => {
    dispatchRowAction(action, rowIndex);
    assert();
  });
}

function saveButton(container: ParentNode): HTMLElement {
  const btn = Array.from(container.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save'));
  if (!btn) throw new Error('Save button not found');
  return btn as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['cms.blog-category:create', 'cms.blog-category:edit', 'cms.blog-category:delete']);
  listBlogCategoriesMock.mockResolvedValue({ data: [CATEGORY], meta: { total: 1 } });
});

/**
 * Feature: Blog Categories admin list
 * Scenario: renders rows from the API, wires row actions (edit/toggle-active/delete) to their
 * matching API calls, and hides create/edit/delete affordances when the caller lacks the matching
 * `cms.blog-category` permission.
 *
 * Given: a mocked `listBlogCategories` response
 * When: the admin views the list, creates, edits, toggles active, or deletes a row
 * Then: the table reflects the fetched rows and each action calls its matching API function
 *
 * Edge cases:
 * - an empty list renders the table with zero rows, not an error
 * - deleting without confirming `window.confirm` never calls `deleteBlogCategory`
 * - a caller with no create/edit/delete permission sees no "New category" button and no row actions
 */
describe('BlogCategoriesList', () => {
  it('renders rows from the mocked listBlogCategories response', async () => {
    renderList();
    await waitForTableLoaded(1);
    expect(listBlogCategoriesMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ page: 1, pageSize: 10 }));
    expect(table().getAttribute('rows')).toContain('Wellness');
  });

  it('renders an empty table (zero rows) when there are no categories yet — not an error (empty state)', async () => {
    listBlogCategoriesMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderList();
    await waitForTableLoaded(0);
    expect(table().getAttribute('rows')).toBe('[]');
  });

  it('"New category" opens the create dialog, which rejects an empty submit client-side without calling createBlogCategory', async () => {
    renderList();
    await waitForTableLoaded(1);

    fireEvent.click(screen.getByText('New category'));
    const addDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('New blog category'))!;
    fireEvent.click(saveButton(addDialog));

    // Live text-field typing can't be reliably driven under this jsdom + @lit/react + React 19
    // stack (same documented limitation as blog-form-dialog.test.tsx) — so this exercises the
    // dialog's client-side required-field guard instead, confirming the wiring never reaches the
    // API with blank required fields.
    await waitFor(() => expect(screen.getByText('Name and slug are required.')).toBeTruthy());
    expect(createBlogCategoryMock).not.toHaveBeenCalled();
  });

  it('edit opens the dialog pre-filled — Save resubmits via updateBlogCategory', async () => {
    updateBlogCategoryMock.mockResolvedValue({ data: { ...CATEGORY, name: 'Wellness Updated' } });
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('edit', () => {
      const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit blog category'));
      if (!dialog) throw new Error('Edit dialog not yet showing');
    });
    const editDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit blog category'))!;
    fireEvent.click(saveButton(editDialog));

    await waitFor(() => expect(updateBlogCategoryMock).toHaveBeenCalledOnce());
    const [token, id, payload] = updateBlogCategoryMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(id).toBe(CATEGORY.id);
    expect(payload).toEqual(expect.objectContaining({ name: CATEGORY.name, slug: CATEGORY.slug }));
  });

  it('the toggle-status row action calls updateBlogCategory with isActive flipped', async () => {
    updateBlogCategoryMock.mockResolvedValue({ data: { ...CATEGORY, isActive: false } });
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('toggle-status', () => {
      expect(updateBlogCategoryMock).toHaveBeenCalledWith('test-token', CATEGORY.id, { isActive: false });
    });
    expect(await screen.findByText('Category deactivated.')).toBeTruthy();
  });

  it('delete confirms via the themed dialog, then calls deleteBlogCategory only when confirmed', async () => {
    deleteBlogCategoryMock.mockResolvedValue({ data: null });
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('delete', () => {
      expect(screen.getByText(`Delete "${CATEGORY.name}"? This cannot be undone.`)).toBeTruthy();
    });
    const confirmDialog = screen.getByText(`Delete "${CATEGORY.name}"? This cannot be undone.`).closest('md-dialog')!;
    fireEvent.click(within(confirmDialog).getByText('Confirm'));

    await waitFor(() => expect(deleteBlogCategoryMock).toHaveBeenCalledWith('test-token', CATEGORY.id));
    expect(await screen.findByText('Blog category deleted.')).toBeTruthy();
  });

  it('delete does NOT call deleteBlogCategory when the confirm dialog is cancelled', async () => {
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('delete', () => {
      expect(screen.getByText(`Delete "${CATEGORY.name}"? This cannot be undone.`)).toBeTruthy();
    });
    const confirmDialog = screen.getByText(`Delete "${CATEGORY.name}"? This cannot be undone.`).closest('md-dialog')!;
    fireEvent.click(within(confirmDialog).getByText('Cancel'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteBlogCategoryMock).not.toHaveBeenCalled();
  });

  it('hides "New category" and every row action when the caller has no cms.blog-category create/edit/delete permission', async () => {
    grantedPermissions = new Set(); // view-only
    renderList();
    await waitForTableLoaded(1);

    expect(screen.queryByText('New category')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions).toEqual([]);
  });
});
