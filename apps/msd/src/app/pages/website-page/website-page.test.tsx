import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../api/rbac/client';
import type { CatalogWebsitePage } from '../../../api/catalog';

const getCatalogPageMock = vi.fn();

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    getCatalogPage: (...args: unknown[]) => getCatalogPageMock(...args),
  };
});

import { WebsitePage } from './website-page';

const PAGE: CatalogWebsitePage = {
  id: 'page-1',
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  content: [
    { type: 'heading', text: 'Introduction' },
    { type: 'paragraph', text: 'We respect your privacy.' },
  ],
  metaTitle: null,
  metaDescription: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: public legal page (one reusable component for privacy/terms/accessibility/cookies)
 * Scenario: `GET /catalog/pages/:slug` on mount + slug change, rendering the title and
 * `content: BlogBlock[]` body exactly as saved from the CMS admin Legal Pages screen.
 *
 * Given: a mocked `getCatalogPage` response
 * When: the page mounts with a given `slug` prop
 * Then: `getCatalogPage` is called with that slug and the title/body render
 *
 * Edge cases:
 * - a page with empty `content` renders an empty-state message, not a blank body
 * - an unknown/draft slug (404 NOT_FOUND) renders a distinct "could not be found" message
 * - a non-404 fetch failure renders its own error message
 */
describe('WebsitePage (public page)', () => {
  it('renders a loading state before the fetch resolves', () => {
    getCatalogPageMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<WebsitePage slug="privacy-policy" />);

    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('fetches by slug and renders the title and body blocks on successful load', async () => {
    getCatalogPageMock.mockResolvedValue({ data: PAGE });
    render(<WebsitePage slug="privacy-policy" />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy();
    expect(getCatalogPageMock).toHaveBeenCalledWith('privacy-policy');
    expect(screen.getByRole('heading', { level: 2, name: 'Introduction' })).toBeTruthy();
    expect(screen.getByText('We respect your privacy.')).toBeTruthy();
  });

  it('re-fetches when the slug prop changes', async () => {
    getCatalogPageMock.mockResolvedValue({ data: PAGE });
    const { rerender } = render(<WebsitePage slug="privacy-policy" />);
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' });

    getCatalogPageMock.mockResolvedValue({ data: { ...PAGE, slug: 'terms-of-service', title: 'Terms of Service', content: [] } });
    rerender(<WebsitePage slug="terms-of-service" />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })).toBeTruthy();
    expect(getCatalogPageMock).toHaveBeenLastCalledWith('terms-of-service');
  });

  it('renders an empty-state message when the page has no content yet (empty state)', async () => {
    getCatalogPageMock.mockResolvedValue({ data: { ...PAGE, content: [] } });
    render(<WebsitePage slug="privacy-policy" />);

    expect(await screen.findByText('This page has no content yet.')).toBeTruthy();
  });

  it('renders a distinct "could not be found" message for a 404 NOT_FOUND (unknown or draft slug)', async () => {
    getCatalogPageMock.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Page not found', 404));
    render(<WebsitePage slug="does-not-exist" />);

    expect(await screen.findByText('This page could not be found.')).toBeTruthy();
  });

  it('renders a generic error message instead of crashing for a non-404 failure (error state)', async () => {
    getCatalogPageMock.mockRejectedValue(new Error('network down'));
    render(<WebsitePage slug="privacy-policy" />);

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
