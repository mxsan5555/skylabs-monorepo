import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogSocialMediaLink } from '../../api/catalog';

const listCatalogCategoriesMock = vi.fn();
const listCatalogSocialLinksMock = vi.fn();

vi.mock('../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../api/catalog')>('../../api/catalog');
  return {
    ...actual,
    listCatalogCategories: (...args: unknown[]) => listCatalogCategoriesMock(...args),
    listCatalogSocialLinks: (...args: unknown[]) => listCatalogSocialLinksMock(...args),
  };
});

import { Footer } from './footer';

const SOCIAL_LINKS: CatalogSocialMediaLink[] = [
  { id: 'link-1', platform: 'instagram', displayName: 'Instagram', url: 'https://instagram.com/skylabs' },
  { id: 'link-2', platform: 'tiktok', displayName: 'TikTok', url: 'https://tiktok.com/@skylabs' },
];

/** `DEFAULT_SOCIAL_ICON`'s own `<path>` `d` attribute (see footer.tsx) — the one signal that
 *  distinguishes "fell back to the generic icon" from "matched a known platform key", since both
 *  render as anonymous, textless inline SVGs. */
const DEFAULT_ICON_PATH_D =
  'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

function socialLinkAnchors(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll('.site-footer__social-link'));
}

beforeEach(() => {
  vi.clearAllMocks();
  listCatalogCategoriesMock.mockResolvedValue({ data: [] });
});

/**
 * Feature: site footer — social links
 * Scenario: the social icon row is driven entirely by `GET /catalog/social-links` (never a static
 * list in `content.json`), and any `platform` key the footer's `SOCIAL_ICONS` map doesn't
 * recognize falls back to a generic icon instead of breaking.
 *
 * Given: a mocked `listCatalogSocialLinks` response
 * When: the footer mounts
 * Then: one link renders per row, using the row's own `url`/`displayName`, with the matching
 *       platform icon (or the generic fallback for an unmapped platform)
 *
 * Edge cases:
 * - zero social links renders no social anchors at all, not an error
 * - a fetch failure renders no social anchors, without crashing the rest of the footer
 */
describe('Footer — social links', () => {
  it('shows a loading placeholder before the social links fetch resolves', () => {
    listCatalogSocialLinksMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderFooter();

    expect(screen.getByText('Loading...', { selector: '.site-footer__social-loading' })).toBeTruthy();
  });

  it('renders social links dynamically from the API — one anchor per row, using its own url/displayName', async () => {
    listCatalogSocialLinksMock.mockResolvedValue({ data: SOCIAL_LINKS });
    renderFooter();

    await waitFor(() => expect(socialLinkAnchors().length).toBe(2));
    const instagramLink = socialLinkAnchors().find((a) => a.getAttribute('aria-label') === 'Instagram');
    expect(instagramLink?.getAttribute('href')).toBe('https://instagram.com/skylabs');
    expect(instagramLink?.getAttribute('target')).toBe('_blank');
    expect(instagramLink?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders the known-platform icon for a mapped platform (instagram), not the generic fallback', async () => {
    listCatalogSocialLinksMock.mockResolvedValue({ data: SOCIAL_LINKS });
    renderFooter();

    await waitFor(() => expect(socialLinkAnchors().length).toBe(2));
    const instagramLink = socialLinkAnchors().find((a) => a.getAttribute('aria-label') === 'Instagram')!;
    // Instagram's icon is the only one with a `<circle>` element (the camera lens dot) — a
    // reliable, icon-specific signal distinct from the generic fallback's single `<path>`.
    expect(instagramLink.querySelector('svg circle')).toBeTruthy();
    expect(instagramLink.querySelector('svg path')?.getAttribute('d')).not.toBe(DEFAULT_ICON_PATH_D);
  });

  it('falls back to the generic icon for an unmapped platform (tiktok) instead of breaking', async () => {
    listCatalogSocialLinksMock.mockResolvedValue({ data: SOCIAL_LINKS });
    renderFooter();

    await waitFor(() => expect(socialLinkAnchors().length).toBe(2));
    const tiktokLink = socialLinkAnchors().find((a) => a.getAttribute('aria-label') === 'TikTok')!;
    expect(tiktokLink.querySelector('svg path')?.getAttribute('d')).toBe(DEFAULT_ICON_PATH_D);
  });

  it('renders no social anchors when there are no active links (empty state)', async () => {
    listCatalogSocialLinksMock.mockResolvedValue({ data: [] });
    renderFooter();

    await waitFor(() => expect(listCatalogSocialLinksMock).toHaveBeenCalled());
    expect(socialLinkAnchors()).toEqual([]);
  });

  it('renders no social anchors (and never crashes the rest of the footer) when the fetch fails (error state)', async () => {
    listCatalogSocialLinksMock.mockRejectedValue(new Error('network down'));
    renderFooter();

    await waitFor(() => expect(listCatalogSocialLinksMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Loading...', { selector: '.site-footer__social-loading' })).toBeNull());
    expect(socialLinkAnchors()).toEqual([]);
    // The rest of the footer (e.g. its landmark role) still renders fine.
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});
