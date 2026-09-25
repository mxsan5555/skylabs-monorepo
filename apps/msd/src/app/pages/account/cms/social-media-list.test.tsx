import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import type { SocialMediaLink } from '../../../../api/rbac/social-media';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const listSocialMediaLinksMock = vi.fn();
const createSocialMediaLinkMock = vi.fn();
const updateSocialMediaLinkMock = vi.fn();
const deleteSocialMediaLinkMock = vi.fn();

vi.mock('../../../../api/rbac/social-media', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/social-media')>('../../../../api/rbac/social-media');
  return {
    ...actual,
    listSocialMediaLinks: (...args: unknown[]) => listSocialMediaLinksMock(...args),
    createSocialMediaLink: (...args: unknown[]) => createSocialMediaLinkMock(...args),
    updateSocialMediaLink: (...args: unknown[]) => updateSocialMediaLinkMock(...args),
    deleteSocialMediaLink: (...args: unknown[]) => deleteSocialMediaLinkMock(...args),
  };
});

import { SocialMediaList } from './social-media-list';

const LINK: SocialMediaLink = {
  id: 'link-1',
  platform: 'instagram',
  displayName: 'Instagram',
  url: 'https://instagram.com/skylabs',
  isActive: true,
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderList() {
  return render(
    <ToastProvider>
      <SocialMediaList />
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

function saveButton(container: ParentNode): HTMLElement {
  const btn = Array.from(container.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save'));
  if (!btn) throw new Error('Save button not found');
  return btn as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['cms.social-media:create', 'cms.social-media:edit', 'cms.social-media:delete']);
  listSocialMediaLinksMock.mockResolvedValue({ data: [LINK], meta: { total: 1 } });
});

/**
 * Feature: Social Media Links admin list
 * Scenario: renders rows from the API, wires row actions (edit/toggle-active/delete) to their
 * matching API calls, and hides create/edit/delete affordances when the caller lacks the matching
 * `cms.social-media` permission.
 *
 * Given: a mocked `listSocialMediaLinks` response
 * When: the admin views the list, creates, edits, toggles active, or deletes a row
 * Then: the table reflects the fetched rows and each action calls its matching API function
 *
 * Edge cases:
 * - an empty list renders the table with zero rows, not an error
 * - deleting without confirming `window.confirm` never calls `deleteSocialMediaLink`
 * - a caller with no create/edit/delete permission sees no "New social link" button and no row actions
 */
describe('SocialMediaList', () => {
  it('renders rows from the mocked listSocialMediaLinks response', async () => {
    renderList();
    await waitForTableLoaded(1);
    expect(listSocialMediaLinksMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ page: 1, pageSize: 10 }));
    expect(table().getAttribute('rows')).toContain('Instagram');
  });

  it('renders an empty table (zero rows) when there are no links yet — not an error (empty state)', async () => {
    listSocialMediaLinksMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderList();
    await waitForTableLoaded(0);
    expect(table().getAttribute('rows')).toBe('[]');
  });

  it('"New social link" opens the create dialog, which rejects an empty submit client-side without calling createSocialMediaLink', async () => {
    renderList();
    await waitForTableLoaded(1);

    fireEvent.click(screen.getByText('New social link'));
    const addDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('New social media link'))!;
    fireEvent.click(saveButton(addDialog));

    // Live text-field/select typing can't be reliably driven under this jsdom + @lit/react +
    // React 19 stack (same documented limitation as blog-form-dialog.test.tsx) — the platform
    // select already defaults to a valid option ('facebook'), so what's missing here is
    // displayName/url, which is enough to exercise the client-side required-field guard.
    await waitFor(() => expect(screen.getByText('Platform, display name, and URL are required.')).toBeTruthy());
    expect(createSocialMediaLinkMock).not.toHaveBeenCalled();
  });

  it('edit opens the dialog pre-filled — Save resubmits via updateSocialMediaLink', async () => {
    updateSocialMediaLinkMock.mockResolvedValue({ data: { ...LINK, displayName: 'Instagram Updated' } });
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('edit', () => {
      const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit social media link'));
      if (!dialog) throw new Error('Edit dialog not yet showing');
    });
    const editDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit social media link'))!;
    fireEvent.click(saveButton(editDialog));

    await waitFor(() => expect(updateSocialMediaLinkMock).toHaveBeenCalledOnce());
    const [token, id, payload] = updateSocialMediaLinkMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(id).toBe(LINK.id);
    expect(payload).toEqual(expect.objectContaining({ platform: LINK.platform, displayName: LINK.displayName, url: LINK.url }));
  });

  it('the toggle-status row action calls updateSocialMediaLink with isActive flipped', async () => {
    updateSocialMediaLinkMock.mockResolvedValue({ data: { ...LINK, isActive: false } });
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('toggle-status', () => {
      expect(updateSocialMediaLinkMock).toHaveBeenCalledWith('test-token', LINK.id, { isActive: false });
    });
    expect(await screen.findByText('Link deactivated.')).toBeTruthy();
  });

  it('delete confirms via window.confirm, then calls deleteSocialMediaLink only when confirmed', async () => {
    deleteSocialMediaLinkMock.mockResolvedValue({ data: null });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('delete', () => {
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining(LINK.displayName));
    });
    await waitFor(() => expect(deleteSocialMediaLinkMock).toHaveBeenCalledWith('test-token', LINK.id));
    expect(await screen.findByText('Social media link deleted.')).toBeTruthy();
  });

  it('delete does NOT call deleteSocialMediaLink when window.confirm is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderList();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('delete', () => {
      expect(confirmSpy).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteSocialMediaLinkMock).not.toHaveBeenCalled();
  });

  it('hides "New social link" and every row action when the caller has no cms.social-media create/edit/delete permission', async () => {
    grantedPermissions = new Set(); // view-only
    renderList();
    await waitForTableLoaded(1);

    expect(screen.queryByText('New social link')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions).toEqual([]);
  });
});
