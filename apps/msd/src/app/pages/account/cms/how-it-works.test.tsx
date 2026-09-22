import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { HowItWorksContent, HowItWorksStep } from '../../../../api/rbac/how-it-works';

let grantedPermissions: Set<string>;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: (menuKey: string, action = 'view') => grantedPermissions.has(`${menuKey}:${action}`),
  }),
}));

const getHowItWorksContentMock = vi.fn();
const updateHowItWorksContentMock = vi.fn();
const listHowItWorksStepsMock = vi.fn();
const createHowItWorksStepMock = vi.fn();
const updateHowItWorksStepMock = vi.fn();
const deleteHowItWorksStepMock = vi.fn();
const reorderHowItWorksStepsMock = vi.fn();

vi.mock('../../../../api/rbac/how-it-works', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/how-it-works')>('../../../../api/rbac/how-it-works');
  return {
    ...actual,
    getHowItWorksContent: (...args: unknown[]) => getHowItWorksContentMock(...args),
    updateHowItWorksContent: (...args: unknown[]) => updateHowItWorksContentMock(...args),
    listHowItWorksSteps: (...args: unknown[]) => listHowItWorksStepsMock(...args),
    createHowItWorksStep: (...args: unknown[]) => createHowItWorksStepMock(...args),
    updateHowItWorksStep: (...args: unknown[]) => updateHowItWorksStepMock(...args),
    deleteHowItWorksStep: (...args: unknown[]) => deleteHowItWorksStepMock(...args),
    reorderHowItWorksSteps: (...args: unknown[]) => reorderHowItWorksStepsMock(...args),
  };
});

import { HowItWorksPage } from './how-it-works';

const CONTENT: HowItWorksContent = {
  id: 'singleton',
  heroTitle: 'How It Works',
  heroSubtitle: 'Book in three easy steps',
  metaTitle: null,
  metaDescription: null,
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const STEP_1: HowItWorksStep = {
  id: 'step-1',
  title: 'Choose a Deal',
  description: 'Browse and pick.',
  icon: 'search',
  sortOrder: 0,
  isActive: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const STEP_2: HowItWorksStep = {
  id: 'step-2',
  title: 'Book a Slot',
  description: 'Select a date and time.',
  icon: 'event',
  sortOrder: 1,
  isActive: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderPage() {
  return render(
    <ToastProvider>
      <HowItWorksPage />
    </ToastProvider>,
  );
}

function saveIntroButton(): HTMLElement {
  const btn = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save intro'));
  if (!btn) throw new Error('Save intro button not found');
  return btn as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  grantedPermissions = new Set(['cms.how-it-works:edit', 'cms.how-it-works:create', 'cms.how-it-works:delete']);
  getHowItWorksContentMock.mockResolvedValue({ data: CONTENT });
  listHowItWorksStepsMock.mockResolvedValue({ data: [STEP_1, STEP_2] });
});

/**
 * Feature: How It Works admin page — intro singleton + reorderable steps list
 * Scenario: the intro form follows the same GET-on-mount/PATCH-on-save shape as About Us; the
 * steps section is a flat reorderable list (up/down arrows, not drag-and-drop) with its own
 * add/edit dialog and `window.confirm` delete, all gated on the single `cms.how-it-works` key.
 *
 * Given: mocked `getHowItWorksContent`/`listHowItWorksSteps` responses
 * When: the admin saves the intro, adds/edits/reorders/deletes a step
 * Then: each action calls its matching API function with the expected payload
 *
 * Edge cases:
 * - no steps yet renders "No steps yet." instead of an empty list
 * - a load failure for either the intro or the steps renders its own error message
 * - a caller with no `cms.how-it-works` permissions sees no Save/Add/reorder/delete affordances
 */
describe('HowItWorksPage', () => {
  it('initial load fetches the intro content and renders the steps list', async () => {
    renderPage();

    // `contentLoading` gates the whole page (see how-it-works.tsx's own early-return) — the steps
    // section (and this "Choose a Deal" step title) only ever renders once the intro GET has
    // resolved, so waiting on it also proves the intro load completed. Field *values* aren't
    // asserted directly (`@lit/react`-wrapped Material text fields don't reflect live value in a
    // way `getByDisplayValue` can see under jsdom — same documented gap as settings.test.tsx).
    expect(await screen.findByText('Choose a Deal')).toBeTruthy();
    expect(screen.getByText('Book a Slot')).toBeTruthy();
    expect(getHowItWorksContentMock).toHaveBeenCalledWith('test-token');
    expect(screen.getByText(/Last saved/)).toBeTruthy();
  });

  it('renders "No steps yet." when there are no steps (empty state)', async () => {
    listHowItWorksStepsMock.mockResolvedValue({ data: [] });
    renderPage();

    expect(await screen.findByText('No steps yet.')).toBeTruthy();
  });

  it('shows an error message when loading the intro content fails (error state)', async () => {
    getHowItWorksContentMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByText('Could not load How It Works content.')).toBeTruthy();
  });

  it('shows an error message when loading steps fails, without crashing the intro section (error state)', async () => {
    listHowItWorksStepsMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByText('Could not load steps.')).toBeTruthy();
    expect(screen.getByText(/Last saved/)).toBeTruthy();
  });

  it('Save intro calls updateHowItWorksContent and shows a success toast', async () => {
    updateHowItWorksContentMock.mockResolvedValue({ data: CONTENT });
    renderPage();
    await screen.findByText('Choose a Deal');

    fireEvent.click(saveIntroButton());

    await waitFor(() => expect(updateHowItWorksContentMock).toHaveBeenCalledOnce());
    const [token, payload] = updateHowItWorksContentMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(payload).toEqual(expect.objectContaining({ heroTitle: CONTENT.heroTitle, heroSubtitle: CONTENT.heroSubtitle }));
    expect(await screen.findByText('How It Works content saved.')).toBeTruthy();
  });

  it('a VALIDATION_ERROR on intro save renders the matching field-level error', async () => {
    updateHowItWorksContentMock.mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, { fieldErrors: { heroTitle: ['Too long.'] } }),
    );
    renderPage();
    await screen.findByText('Choose a Deal');

    fireEvent.click(saveIntroButton());

    expect(await screen.findByText('Too long.')).toBeTruthy();
  });

  it('Add step opens the create dialog; a blank submit is rejected client-side without calling createHowItWorksStep', async () => {
    renderPage();
    await screen.findByText('Choose a Deal');

    fireEvent.click(screen.getByText('Add step'));
    const addDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('New step'))!;
    const saveBtn = Array.from(addDialog.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save')) as HTMLElement;
    fireEvent.click(saveBtn);

    await waitFor(() => expect(screen.getByText('Title and description are required.')).toBeTruthy());
    expect(createHowItWorksStepMock).not.toHaveBeenCalled();
  });

  it('Edit opens the dialog pre-filled — Save resubmits the step via updateHowItWorksStep', async () => {
    updateHowItWorksStepMock.mockResolvedValue({ data: { ...STEP_1, title: 'Choose a Deal (Updated)' } });
    renderPage();
    await screen.findByText('Choose a Deal');

    fireEvent.click(screen.getByLabelText('Edit Choose a Deal'));
    const editDialog = Array.from(document.querySelectorAll('md-dialog')).find((d) => d.textContent?.includes('Edit step'))!;
    const saveBtn = Array.from(editDialog.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save')) as HTMLElement;
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateHowItWorksStepMock).toHaveBeenCalledOnce());
    const [token, id, payload] = updateHowItWorksStepMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(id).toBe(STEP_1.id);
    expect(payload).toEqual(expect.objectContaining({ title: STEP_1.title, description: STEP_1.description }));
  });

  it('moving a step earlier/later calls reorderHowItWorksSteps with the swapped id order', async () => {
    reorderHowItWorksStepsMock.mockResolvedValue({ data: { reordered: true } });
    renderPage();
    await screen.findByText('Book a Slot');

    fireEvent.click(screen.getByLabelText('Move Book a Slot earlier'));

    await waitFor(() => expect(reorderHowItWorksStepsMock).toHaveBeenCalledWith('test-token', [STEP_2.id, STEP_1.id]));
  });

  it('a failed reorder reverts the local order and shows an error', async () => {
    reorderHowItWorksStepsMock.mockRejectedValue(new Error('network down'));
    renderPage();
    await screen.findByText('Book a Slot');

    fireEvent.click(screen.getByLabelText('Move Book a Slot earlier'));

    // Renders twice by design — once as the inline `error-state` paragraph, once as the toast
    // (see `moveStep`'s catch block: both `setStepsError(msg)` and `showToast(msg, 'error')`
    // fire), same convention as blog-form-dialog.test.tsx's identical doc comment.
    await waitFor(() => expect(screen.getAllByText('Could not reorder steps.').length).toBeGreaterThan(0));
  });

  it('delete confirms via window.confirm, then calls deleteHowItWorksStep only when confirmed', async () => {
    deleteHowItWorksStepMock.mockResolvedValue({ data: null });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Choose a Deal');

    fireEvent.click(screen.getByLabelText('Delete Choose a Deal'));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining(STEP_1.title));
    await waitFor(() => expect(deleteHowItWorksStepMock).toHaveBeenCalledWith('test-token', STEP_1.id));
    expect(await screen.findByText('Step deleted.')).toBeTruthy();
  });

  it('delete does NOT call deleteHowItWorksStep when window.confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByText('Choose a Deal');

    fireEvent.click(screen.getByLabelText('Delete Choose a Deal'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deleteHowItWorksStepMock).not.toHaveBeenCalled();
  });

  it('hides Save intro, Add step, reorder, edit, and delete affordances when the caller has no cms.how-it-works permissions', async () => {
    grantedPermissions = new Set(); // view-only
    renderPage();
    await screen.findByText('Choose a Deal');

    expect(screen.queryByText('Save intro')).toBeNull();
    expect(screen.queryByText('Add step')).toBeNull();
    expect(screen.queryByLabelText('Move Choose a Deal later')).toBeNull();
    expect(screen.queryByLabelText('Edit Choose a Deal')).toBeNull();
    expect(screen.queryByLabelText('Delete Choose a Deal')).toBeNull();
  });
});
