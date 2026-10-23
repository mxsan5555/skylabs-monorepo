import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../api/rbac/client';
import type { CatalogWebsitePage } from '../../../api/catalog';
import { WebsitePage } from './website-page';
import content from '../../../content.json';

const { getCatalogPageMock } = vi.hoisted(() => ({ getCatalogPageMock: vi.fn() }));

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return { ...actual, getCatalogPage: getCatalogPageMock };
});

const PAGE: CatalogWebsitePage = {
  id: 'page-1',
  slug: 'privacy',
  title: 'Privacy Policy (CMS)',
  content: [
    { type: 'heading', text: 'Introduction' },
    { type: 'paragraph', text: 'We respect your privacy.' },
  ],
  metaTitle: null,
  metaDescription: null,
  updatedAt: '2026-10-14T09:56:03.148Z',
};

const firstFallbackHeading = (key: 'privacy' | 'terms') => (content.legalPages[key].body[0] as { text: string }).text;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: one public legal page for privacy / terms / accessibility / cookies (StaticPage frame)
 * Scenario: `GET /catalog/pages/:slug` (slug = page key) on mount and page change; the CMS body
 * wins once an admin writes one, otherwise the content.json default renders.
 *
 * Edge cases:
 * - the seeded "Content coming soon." placeholder counts as no content
 * - a 404 or network failure renders the default, never an error
 */
describe('WebsitePage (legal pages)', () => {
  it('renders a loading state before the fetch resolves', () => {
    getCatalogPageMock.mockReturnValue(new Promise(vi.fn()));
    render(<MemoryRouter><WebsitePage page="privacy" /></MemoryRouter>);

    expect(screen.getByRole('status').textContent).toBe(content.staticPage.loading);
  });

  it('fetches by page key and renders the CMS title, body and last-updated date', async () => {
    getCatalogPageMock.mockResolvedValue({ data: PAGE });
    render(<MemoryRouter><WebsitePage page="privacy" /></MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 2, name: 'Introduction' })).toBeTruthy();
    expect(getCatalogPageMock).toHaveBeenCalledWith('privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy (CMS)' })).toBeTruthy();
    expect(screen.getByText('We respect your privacy.')).toBeTruthy();
    expect(document.querySelector('time')?.getAttribute('dateTime')).toBe(PAGE.updatedAt);
  });

  it('renders the default body when the CMS row only holds the seeded placeholder', async () => {
    getCatalogPageMock.mockResolvedValue({
      data: { ...PAGE, content: [{ type: 'paragraph', text: content.legalPages.placeholder }] },
    });
    render(<MemoryRouter><WebsitePage page="privacy" /></MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 2, name: firstFallbackHeading('privacy') })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: content.legalPages.privacy.title })).toBeTruthy();
    expect(screen.queryByText(content.legalPages.placeholder)).toBeNull();
    expect(document.querySelector('time')).toBeNull();
  });

  it('renders the default body for a 404 instead of an error', async () => {
    getCatalogPageMock.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Page not found', 404));
    render(<MemoryRouter><WebsitePage page="terms" /></MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 2, name: firstFallbackHeading('terms') })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('re-fetches when the page changes', async () => {
    getCatalogPageMock.mockResolvedValue({ data: PAGE });
    const { rerender } = render(<MemoryRouter><WebsitePage page="privacy" /></MemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy (CMS)' });

    getCatalogPageMock.mockResolvedValue({ data: { ...PAGE, slug: 'terms', title: 'Terms (CMS)' } });
    rerender(<MemoryRouter><WebsitePage page="terms" /></MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Terms (CMS)' })).toBeTruthy();
    expect(getCatalogPageMock).toHaveBeenLastCalledWith('terms');
  });
});
