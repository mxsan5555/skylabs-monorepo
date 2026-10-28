import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CatalogDeal, CatalogHomeTagSection } from '../../../api/catalog';
import { HomeTagSections } from './home-tag-sections';

// CardRail's "See all" link needs a router context.
function renderRails(renderDeal: (deal: CatalogDeal) => ReactNode = (d) => <span key={d.id}>{d.title}</span>) {
  return render(
    <MemoryRouter>
      <HomeTagSections renderDeal={renderDeal} />
    </MemoryRouter>,
  );
}

const getHomeTagSectionsMock = vi.fn();
vi.mock('../../../api/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/catalog')>()),
  getCatalogHomeTagSections: (...args: unknown[]) => getHomeTagSectionsMock(...args),
}));

const location = vi.hoisted(() => ({ status: 'ready', state: 'Delhi' as string | null }));
vi.mock('../../../location/location-context', () => ({ useVisitorLocation: () => location }));

const deal = (id: string): CatalogDeal => ({ id, title: `Deal ${id}` }) as CatalogDeal;

const SECTIONS: CatalogHomeTagSection[] = [
  { tag: 'NEW', title: 'New', state: 'Delhi', deals: [deal('n1')] },
  { tag: 'HOT_DEAL', title: 'Hot Deal', state: null, deals: [deal('h1'), deal('h2')] },
];

beforeEach(() => {
  location.status = 'ready';
  location.state = 'Delhi';
  getHomeTagSectionsMock.mockReset().mockResolvedValue({ data: SECTIONS });
});

describe('HomeTagSections rails (PLANNING §7.1)', () => {
  it('renders only the tags the server resolved, in the storefront order (New, Hot Deal, Deal, Expire soon)', async () => {
    const { container } = renderRails();
    await waitFor(() => expect(getHomeTagSectionsMock).toHaveBeenCalledWith('Delhi'));
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual(['New', 'Hot Deal']);
  });

  it('renders every deal of a resolved section via the shared renderDeal', async () => {
    const { findByText } = renderRails();
    expect(await findByText('Deal h1')).toBeTruthy();
    expect(await findByText('Deal h2')).toBeTruthy();
    expect(await findByText('Deal n1')).toBeTruthy();
  });

  it('renders nothing for a tag the server omitted (no eligible section anywhere)', async () => {
    const { container } = renderRails();
    await waitFor(() => expect(getHomeTagSectionsMock).toHaveBeenCalled());
    const headings = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).not.toContain('Deal');
    expect(headings).not.toContain('Expire Soon');
  });

  it('renders nothing at all while the visitor location is still resolving', () => {
    location.status = 'locating';
    const { container } = renderRails();
    expect(getHomeTagSectionsMock).not.toHaveBeenCalled();
    expect(container.querySelector('h2')).toBeNull();
  });

  it('passes the visitor state through to the public endpoint, undefined when unknown', async () => {
    location.state = null;
    renderRails();
    await waitFor(() => expect(getHomeTagSectionsMock).toHaveBeenCalledWith(undefined));
  });

  it('renders nothing when the server resolves no sections at all', async () => {
    getHomeTagSectionsMock.mockResolvedValue({ data: [] });
    const { container } = renderRails();
    await waitFor(() => expect(getHomeTagSectionsMock).toHaveBeenCalled());
    expect(container.querySelector('h2')).toBeNull();
  });
});

