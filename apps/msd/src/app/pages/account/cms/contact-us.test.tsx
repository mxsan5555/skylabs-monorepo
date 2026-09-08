import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../../../../toast/toast-context';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { ContactUsContent } from '../../../../api/rbac/site-content';

let canEditContactUs = true;

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({
  useAuth: () => ({
    token: 'test-token',
    can: () => canEditContactUs,
  }),
}));

const getContactUsMock = vi.fn();
const updateContactUsMock = vi.fn();

vi.mock('../../../../api/rbac/site-content', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/site-content')>('../../../../api/rbac/site-content');
  return {
    ...actual,
    getContactUs: (...args: unknown[]) => getContactUsMock(...args),
    updateContactUs: (...args: unknown[]) => updateContactUsMock(...args),
  };
});

import { ContactUsPage } from './contact-us';

const SAVED: ContactUsContent = {
  id: 'singleton',
  address: '123 Main St',
  phone: '555-0100',
  email: 'hello@skylabs.dev',
  mapEmbedUrl: 'https://maps.example.com/embed',
  socialLinks: [{ platform: 'Instagram', url: 'https://instagram.com/skylabs' }],
  metaTitle: null,
  metaDescription: null,
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const EMPTY_DEFAULTS: ContactUsContent = {
  id: 'singleton',
  address: '',
  phone: '',
  email: '',
  mapEmbedUrl: '',
  socialLinks: [],
  metaTitle: null,
  metaDescription: null,
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function renderPage() {
  return render(
    <ToastProvider>
      <ContactUsPage />
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
  canEditContactUs = true;
});

/**
 * Feature: Contact Us singleton admin form
 * Scenario: same GET-on-mount/PATCH-on-save/toast/field-error shape as About Us (no media —
 * `ContactUsContent` has no gallery, see msd-api's schema doc comment).
 *
 * Given: the admin Contact Us screen
 * When: it mounts, the admin saves, or a 422 comes back
 * Then: fetched values render, Save calls `updateContactUs` with the loaded shape, and field
 *       errors render under the matching field
 *
 * Edge cases:
 * - a fresh instance with nothing ever saved yet still renders the empty-defaults singleton
 * - a network/load failure renders an error message instead of crashing
 */
describe('ContactUsPage', () => {
  it('initial load renders the fetched values ("Last saved" reflects the loaded updatedAt)', async () => {
    getContactUsMock.mockResolvedValue({ data: SAVED });
    renderPage();

    expect(await screen.findByText(/Last saved/)).toBeTruthy();
    expect(getContactUsMock).toHaveBeenCalledWith('test-token');
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('renders the empty-defaults singleton when nothing has ever been saved (empty state)', async () => {
    getContactUsMock.mockResolvedValue({ data: EMPTY_DEFAULTS });
    renderPage();

    await screen.findByText(/Last saved/);
    expect(screen.getByText('Contact Us')).toBeTruthy();
    expect(screen.getByText('No social links yet.')).toBeTruthy();
  });

  it('shows an error message and never crashes when loading fails (error state)', async () => {
    getContactUsMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByText('Could not load Contact Us content.')).toBeTruthy();
  });

  it('Save calls updateContactUs with the loaded content (unmodified) and shows a success toast', async () => {
    getContactUsMock.mockResolvedValue({ data: SAVED });
    updateContactUsMock.mockResolvedValue({ data: SAVED });
    renderPage();
    await screen.findByText(/Last saved/);

    fireEvent.click(saveButton());

    await waitFor(() => expect(updateContactUsMock).toHaveBeenCalledOnce());
    const [token, payload] = updateContactUsMock.mock.calls[0];
    expect(token).toBe('test-token');
    expect(payload).toEqual(
      expect.objectContaining({
        address: SAVED.address,
        phone: SAVED.phone,
        email: SAVED.email,
        mapEmbedUrl: SAVED.mapEmbedUrl,
        socialLinks: SAVED.socialLinks,
      }),
    );
    expect(await screen.findByText('Contact Us content saved.')).toBeTruthy();
  });

  it('a VALIDATION_ERROR response renders the matching field-level error', async () => {
    getContactUsMock.mockResolvedValue({ data: SAVED });
    updateContactUsMock.mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, { fieldErrors: { email: ['Must be a valid email.'] } }),
    );
    renderPage();
    await screen.findByText(/Last saved/);

    fireEvent.click(saveButton());

    expect(await screen.findByText('Must be a valid email.')).toBeTruthy();
    expect(await screen.findByText('Fix the highlighted fields and try again.')).toBeTruthy();
  });

  // Reload-after-save: ContactUsPage only GETs on mount and updates local state directly from the
  // PATCH response (no separate re-fetch step) — same architecture as AboutUsPage, so the
  // idiomatic "reload" equivalent is a fresh mount with getContactUs now resolving the persisted
  // shape (see about-us.test.tsx's identical doc comment).
  it('a reload (fresh mount) after a save reflects the persisted content from the server', async () => {
    const persistedUpdatedAt = '2025-06-01T00:00:00.000Z';
    getContactUsMock.mockResolvedValue({ data: { ...SAVED, email: 'updated@skylabs.dev', updatedAt: persistedUpdatedAt } });
    renderPage();

    const expectedText = `Last saved ${new Date(persistedUpdatedAt).toLocaleString()}`;
    expect(await screen.findByText(expectedText)).toBeTruthy();
  });

  it('hides the Save button entirely when the caller lacks cms.contact-us:edit', async () => {
    canEditContactUs = false;
    getContactUsMock.mockResolvedValue({ data: SAVED });
    renderPage();
    await screen.findByText(/Last saved/);

    expect(Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save'))).toBeUndefined();
  });
});
