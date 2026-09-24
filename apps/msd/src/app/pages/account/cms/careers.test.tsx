import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { CareersJobListing, CareersPageContent } from '../../../../api/rbac/careers';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const getCareersContentMock = vi.fn();
const updateCareersContentMock = vi.fn();
const listCareersJobsMock = vi.fn();
const createCareersJobMock = vi.fn();
const updateCareersJobMock = vi.fn();
const setCareersJobStatusMock = vi.fn();
const deleteCareersJobMock = vi.fn();

vi.mock('../../../../api/rbac/careers', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/careers')>('../../../../api/rbac/careers');
  return {
    ...actual,
    getCareersContent: (...args: unknown[]) => getCareersContentMock(...args),
    updateCareersContent: (...args: unknown[]) => updateCareersContentMock(...args),
    listCareersJobs: (...args: unknown[]) => listCareersJobsMock(...args),
    createCareersJob: (...args: unknown[]) => createCareersJobMock(...args),
    updateCareersJob: (...args: unknown[]) => updateCareersJobMock(...args),
    setCareersJobStatus: (...args: unknown[]) => setCareersJobStatusMock(...args),
    deleteCareersJob: (...args: unknown[]) => deleteCareersJobMock(...args),
  };
});

import { CareersPage } from './careers';

const CONTENT: CareersPageContent = {
  id: 'singleton',
  heroTitle: 'Careers',
  heroSubtitle: 'Join our team',
  metaTitle: null,
  metaDescription: null,
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const JOB: CareersJobListing = {
  id: 'job-1',
  jobTitle: 'Massage Therapist',
  department: 'Operations',
  location: 'Bengaluru',
  employmentType: 'Full-time',
  description: 'Provide massage services.',
  responsibilities: 'Deliver excellent sessions.',
  requirements: 'Certified therapist.',
  applyUrl: 'https://example.com/apply',
  applyInstructions: null,
  status: 'DRAFT',
  sortOrder: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderPage() {
  return render(
    <ToastProvider>
      <CareersPage />
    </ToastProvider>,
  );
}

function saveIntroButton(): HTMLElement {
  const btn = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save intro'));
  if (!btn) throw new Error('Save intro button not found');
  return btn as HTMLElement;
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
  grantedPermissions = new Set(['cms.careers:create', 'cms.careers:edit', 'cms.careers:delete']);
  getCareersContentMock.mockResolvedValue({ data: CONTENT });
  listCareersJobsMock.mockResolvedValue({ data: [JOB], meta: { total: 1 } });
});

/**
 * Feature: Careers admin page — intro singleton + full-CRUD job listings table
 * Scenario: the intro form follows the same GET-on-mount/PATCH-on-save shape as About Us; the job
 * listings section mirrors `blog-list.tsx`'s exact table + add/edit-dialog + `window.confirm`
 * delete + publish/unpublish row-action pattern, all gated on the single `cms.careers` key.
 *
 * Given: mocked `getCareersContent`/`listCareersJobs` responses
 * When: the admin saves the intro, or edits/publishes/deletes a job listing row
 * Then: each action calls its matching API function with the expected payload
 *
 * Edge cases:
 * - an empty job list renders the table with zero rows, not an error
 * - a load failure for either the intro or the jobs renders its own error message
 * - a caller with no `cms.careers` permissions sees no Save/New/row-action affordances
 */
describe('CareersPage', () => {
  it('initial load fetches the intro content and renders the job listings table', async () => {
    renderPage();
    await waitForTableLoaded(1);

    expect(getCareersContentMock).toHaveBeenCalledWith('test-token');
    expect(table().getAttribute('rows')).toContain('Massage Therapist');
    expect(screen.getByText(/Last saved/)).toBeTruthy();
  });

  it('renders an empty table (zero rows) when there are no job listings yet — not an error (empty state)', async () => {
    listCareersJobsMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await waitForTableLoaded(0);
    expect(table().getAttribute('rows')).toBe('[]');
  });

  it('shows an error message when loading the intro content fails (error state)', async () => {
    getCareersContentMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByText('Could not load Careers content.')).toBeTruthy();
  });

  it('shows an error message when loading job listings fails, without crashing the intro section (error state)', async () => {
    listCareersJobsMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByText('Could not load job listings.')).toBeTruthy();
    expect(screen.getByText(/Last saved/)).toBeTruthy();
  });

  it('Save intro calls updateCareersContent and shows a success toast', async () => {
    updateCareersContentMock.mockResolvedValue({ data: CONTENT });
    renderPage();
    await waitForTableLoaded(1);

    fireEvent.click(saveIntroButton());

    await waitFor(() => expect(updateCareersContentMock).toHaveBeenCalledOnce());
    const [token, payload] = updateCareersContentMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(payload).toEqual(expect.objectContaining({ heroTitle: CONTENT.heroTitle, heroSubtitle: CONTENT.heroSubtitle }));
    expect(await screen.findByText('Careers content saved.')).toBeTruthy();
  });

  it('a VALIDATION_ERROR on intro save renders the matching field-level error', async () => {
    updateCareersContentMock.mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, { fieldErrors: { heroTitle: ['Too long.'] } }),
    );
    renderPage();
    await waitForTableLoaded(1);

    fireEvent.click(saveIntroButton());

    expect(await screen.findByText('Too long.')).toBeTruthy();
  });

  it('"New job listing" opens the create dialog, which rejects an empty submit client-side without calling createCareersJob', async () => {
    renderPage();
    await waitForTableLoaded(1);

    const newJobButton = Array.from(document.querySelectorAll('md-outlined-button')).find((el) => el.textContent?.includes('New job listing'));
    if (!newJobButton) throw new Error('New job listing button not found');
    fireEvent.click(newJobButton);
    const addDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('New job listing'))!;
    const saveBtn = Array.from(addDialog.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save')) as HTMLElement;
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(
        screen.getByText('Job title, department, location, employment type, description, responsibilities, and requirements are required.'),
      ).toBeTruthy(),
    );
    expect(createCareersJobMock).not.toHaveBeenCalled();
  });

  it('edit opens the dialog pre-filled — Save resubmits via updateCareersJob (status unchanged, no extra status call)', async () => {
    updateCareersJobMock.mockResolvedValue({ data: { ...JOB, jobTitle: 'Massage Therapist (Updated)' } });
    renderPage();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('edit', () => {
      const dialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit job listing'));
      if (!dialog) throw new Error('Edit dialog not yet showing');
    });
    const editDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit job listing'))!;
    const saveBtn = Array.from(editDialog.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save')) as HTMLElement;
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateCareersJobMock).toHaveBeenCalledOnce());
    const [token, id, payload] = updateCareersJobMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(id).toBe(JOB.id);
    expect(payload).toEqual(expect.objectContaining({ jobTitle: JOB.jobTitle, department: JOB.department }));
    // The dialog's own status select is pre-seeded from `job.status` ('DRAFT'), unchanged by this
    // submit, so `saveJob` must never fire the separate status route on top of the main update.
    expect(setCareersJobStatusMock).not.toHaveBeenCalled();
  });

  it('the publish/unpublish row action calls setCareersJobStatus with the flipped status', async () => {
    setCareersJobStatusMock.mockResolvedValue({ data: { ...JOB, status: 'PUBLISHED' } });
    renderPage();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('toggle-status', () => {
      expect(setCareersJobStatusMock).toHaveBeenCalledWith('test-token', JOB.id, 'PUBLISHED');
    });
    expect(await screen.findByText('Job listing published.')).toBeTruthy();
  });

  it('delete confirms via the themed dialog, then calls deleteCareersJob only when confirmed', async () => {
    deleteCareersJobMock.mockResolvedValue({ data: null });
    renderPage();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('delete', () => {
      expect(screen.getByText(`Delete "${JOB.jobTitle}"? This cannot be undone.`)).toBeTruthy();
    });
    const confirmDialog = screen.getByText(`Delete "${JOB.jobTitle}"? This cannot be undone.`).closest('md-dialog')!;
    fireEvent.click(within(confirmDialog).getByText('Confirm'));

    await waitFor(() => expect(deleteCareersJobMock).toHaveBeenCalledWith('test-token', JOB.id));
    expect(await screen.findByText('Job listing deleted.')).toBeTruthy();
  });

  it('delete does NOT call deleteCareersJob when the confirm dialog is cancelled', async () => {
    renderPage();
    await waitForTableLoaded(1);

    await dispatchRowActionUntil('delete', () => {
      expect(screen.getByText(`Delete "${JOB.jobTitle}"? This cannot be undone.`)).toBeTruthy();
    });
    const confirmDialog = screen.getByText(`Delete "${JOB.jobTitle}"? This cannot be undone.`).closest('md-dialog')!;
    fireEvent.click(within(confirmDialog).getByText('Cancel'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteCareersJobMock).not.toHaveBeenCalled();
  });

  it('hides Save intro, "New job listing", and every row action when the caller has no cms.careers permissions', async () => {
    grantedPermissions = new Set(); // view-only
    renderPage();
    await waitForTableLoaded(1);

    expect(screen.queryByText('Save intro')).toBeNull();
    expect(screen.queryByText('New job listing')).toBeNull();
    const actions = JSON.parse(table().getAttribute('actions') ?? '[]') as { event: string }[];
    expect(actions).toEqual([]);
  });
});
