import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { WebsitePage } from '../../../../api/rbac/website-pages';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listWebsitePagesMock = vi.fn();
const updateWebsitePageMock = vi.fn();

vi.mock('../../../../api/rbac/website-pages', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/website-pages')>('../../../../api/rbac/website-pages');
  return {
    ...actual,
    listWebsitePages: (...args: unknown[]) => listWebsitePagesMock(...args),
    updateWebsitePage: (...args: unknown[]) => updateWebsitePageMock(...args),
  };
});

import { LegalPagesList } from './legal-pages-list';

const PAGE: WebsitePage = {
  id: 'page-1',
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  content: [{ type: 'paragraph', text: 'We respect your privacy.' }],
  status: 'DRAFT',
  metaTitle: null,
  metaDescription: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderList() {
  return render(
    <ToastProvider>
      <LegalPagesList />
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

/** See blog-list.test.tsx's identical `dispatchRowActionUntil` doc comment. */
async function dispatchRowActionUntil(action: string, assert: () => void, rowIndex = 0): Promise<void> {
  await waitFor(() => {
    dispatchRowAction(action, rowIndex);
    assert();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['cms.website-pages:edit']);
  listWebsitePagesMock.mockResolvedValue({ data: [PAGE], meta: { total: 1 } });
});

/**
 * Feature: Legal Pages admin list
 * Scenario: an edit-only screen for the 4 fixed legal pages — no create/delete affordance exists
 * at all (unlike every other CRUD screen in this module), matching `cms.website-pages` only ever
 * granting `view`/`edit`.
 *
 * Given: a mocked `listWebsitePages` response
 * When: the admin views the list, edits a page, or toggles its Draft/Published status
 * Then: the table reflects the fetched rows and edit calls `updateWebsitePage`
 *
 * Edge cases:
 * - an empty list renders the table with zero rows, not an error
 * - a caller with no `cms.website-pages:edit` permission sees no row actions at all
 */
describe('LegalPagesList', () => {
  it('renders rows from the mocked listWebsitePages response', async () => {
    renderList();
    await waitForTableLoaded(1);
    expect(listWebsitePagesMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ page: 1, pageSize: 10 }));
    expect(table().getAttribute('rows')).toContain('Privacy Policy');
  });

  it('renders an empty table (zero rows) when there are no pages yet — not an error (empty state)', async () => {
    listWebsitePagesMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderList();
    await waitForTableLoaded(0);
    expect(table().getAttribute('rows')).toBe('[]');
  });

  it('there is no "New" button — no create route exists for this resource', async () => {
    renderList();
    await waitForTableLoaded(1);
    expect(screen.queryByText(/^New /)).toBeNull();
  });

  it('edit opens the dialog pre-filled — Save resubmits via updateWebsitePage', async () => {
    updateWebsitePageMock.mockResolvedValue({ data: { ...PAGE, title: 'Privacy Policy (Updated)' } });
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('edit', () => {
      const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes(`Edit ${PAGE.title}`));
      if (!dialog) throw new Error('Edit dialog not yet showing');
    });
    const editDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes(`Edit ${PAGE.title}`))!;
    const saveBtn = Array.from(editDialog.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save')) as HTMLElement;
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateWebsitePageMock).toHaveBeenCalledOnce());
    const [token, id, payload] = updateWebsitePageMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(id).toBe(PAGE.id);
    expect(payload).toEqual(expect.objectContaining({ title: PAGE.title, status: PAGE.status }));
  });

  it("the edit dialog shows the page's slug as read-only text, never an editable field", async () => {
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('edit', () => {
      const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes(`Edit ${PAGE.title}`));
      if (!dialog) throw new Error('Edit dialog not yet showing');
    });
    expect(screen.getByText(new RegExp(`Slug: ${PAGE.slug}`))).toBeTruthy();
  });

  it('hides every row action when the caller has no cms.website-pages:edit permission', async () => {
    grantedPermissions = new Set(); // no permissions at all
    renderList();
    await waitForTableLoaded(1);

    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions).toEqual([]);
  });
});
