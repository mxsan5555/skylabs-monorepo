import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { AboutUsContent } from '../../../../api/rbac/site-content';

let canEditAboutUs = true;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: () => canEditAboutUs,
  }),
}));

const getAboutUsMock = vi.fn();
const updateAboutUsMock = vi.fn();

vi.mock('../../../../api/rbac/site-content', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/site-content')>('../../../../api/rbac/site-content');
  return {
    ...actual,
    getAboutUs: (...args: unknown[]) => getAboutUsMock(...args),
    updateAboutUs: (...args: unknown[]) => updateAboutUsMock(...args),
  };
});

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

import { AboutUsPage } from './about-us';

const SAVED: AboutUsContent = {
  id: 'singleton',
  heroTitle: 'Who we are',
  heroSubtitle: 'A team that cares',
  missionStatement: 'Making wellness accessible.',
  body: [{ type: 'paragraph', text: 'Our story.' }],
  metaTitle: null,
  metaDescription: null,
  updatedAt: '2025-01-01T00:00:00.000Z',
  mediaImages: [],
};

const EMPTY_DEFAULTS: AboutUsContent = {
  id: 'singleton',
  heroTitle: '',
  heroSubtitle: '',
  missionStatement: '',
  body: [],
  metaTitle: null,
  metaDescription: null,
  updatedAt: '2025-01-01T00:00:00.000Z',
  mediaImages: [],
};

function renderPage() {
  return render(
    <ToastProvider>
      <AboutUsPage />
    </ToastProvider>,
  );
}

function saveButton(): HTMLElement {
  const btn = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save'));
  if (!btn) throw new Error('Save button not found');
  return btn as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  canEditAboutUs = true;
});

/**
 * Feature: About Us singleton admin form
 * Scenario: GET-on-mount loads the saved (or find-or-created empty) singleton row, Save PATCHes
 * it back, a validation error surfaces under the matching field, and a reload after a successful
 * save shows the persisted (server-returned) content.
 *
 * Given: the admin About Us screen
 * When: it mounts, the admin saves, a 422 comes back, or the page is reloaded after a save
 * Then: fetched values render, Save calls `updateAboutUs`, field errors render under the right
 *       field, and a fresh mount after a save shows the newly-persisted content
 *
 * Edge cases:
 * - a fresh instance with nothing ever saved yet still renders (the backend's find-or-create
 *   empty defaults), not an error
 * - a network/load failure renders an error message instead of crashing
 */
describe('AboutUsPage', () => {
  it('initial load renders the fetched values ("Last saved" reflects the loaded updatedAt)', async () => {
    getAboutUsMock.mockResolvedValue({ data: SAVED });
    renderPage();

    expect(await screen.findByText(/Last saved/)).toBeTruthy();
    expect(getAboutUsMock).toHaveBeenCalledWith('test-token');
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('renders the empty-defaults singleton when nothing has ever been saved (empty state)', async () => {
    getAboutUsMock.mockResolvedValue({ data: EMPTY_DEFAULTS });
    renderPage();

    await screen.findByText(/Last saved/);
    // Still renders the page shell/heading normally rather than an error — a fresh find-or-create
    // row is a legitimate, non-error state.
    expect(screen.getByText('About Us')).toBeTruthy();
  });

  it('shows an error message and never crashes when loading fails (error state)', async () => {
    getAboutUsMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByText('Could not load About Us content.')).toBeTruthy();
  });

  it('Save calls updateAboutUs with the loaded content (unmodified) and shows a success toast', async () => {
    getAboutUsMock.mockResolvedValue({ data: SAVED });
    updateAboutUsMock.mockResolvedValue({ data: SAVED });
    renderPage();
    await screen.findByText(/Last saved/);

    fireEvent.click(saveButton());

    await waitFor(() => expect(updateAboutUsMock).toHaveBeenCalledOnce());
    const [token, payload] = updateAboutUsMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(payload).toEqual(
      expect.objectContaining({
        heroTitle: SAVED.heroTitle,
        heroSubtitle: SAVED.heroSubtitle,
        missionStatement: SAVED.missionStatement,
        body: SAVED.body,
      }),
    );
    expect(await screen.findByText('About Us content saved.')).toBeTruthy();
  });

  it('a VALIDATION_ERROR response renders the matching field-level error', async () => {
    getAboutUsMock.mockResolvedValue({ data: SAVED });
    updateAboutUsMock.mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, { fieldErrors: { heroTitle: ['Hero title is too long.'] } }),
    );
    renderPage();
    await screen.findByText(/Last saved/);

    fireEvent.click(saveButton());

    expect(await screen.findByText('Hero title is too long.')).toBeTruthy();
    expect(await screen.findByText('Fix the highlighted fields and try again.')).toBeTruthy();
  });

  // "Reload after save reflects persisted data": AboutUsPage only GETs on mount (the PATCH
  // response itself already updates local state — see submit()'s `setAboutUs(data)` — there is no
  // separate re-fetch step to simulate). The natural equivalent of "reload" for a GET-on-mount
  // component is mounting it again; asserting that a fresh mount, with `getAboutUs` now resolving
  // the just-saved shape, renders that persisted content is the idiomatic version of this check.
  it('a reload (fresh mount) after a save reflects the persisted content from the server', async () => {
    const persistedUpdatedAt = '2025-06-01T00:00:00.000Z';
    getAboutUsMock.mockResolvedValue({ data: { ...SAVED, heroTitle: 'Updated hero title', updatedAt: persistedUpdatedAt } });
    renderPage();

    // Computed the same way about-us.tsx renders it (`new Date(aboutUs.updatedAt).toLocaleString()`)
    // so this assertion isn't hardcoded to one locale's date formatting.
    const expectedText = `Last saved ${new Date(persistedUpdatedAt).toLocaleString()}`;
    expect(await screen.findByText(expectedText)).toBeTruthy();
  });

  it('hides the Save button entirely when the caller lacks cms.about-us:edit', async () => {
    canEditAboutUs = false;
    getAboutUsMock.mockResolvedValue({ data: SAVED });
    renderPage();
    await screen.findByText(/Last saved/);

    expect(Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save'))).toBeUndefined();
  });
});
