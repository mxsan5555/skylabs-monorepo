import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogHowItWorks } from '../../../api/catalog';
import { HowItWorks } from './how-it-works';
import content from '../../../content.json';

const { getCatalogHowItWorksMock } = vi.hoisted(() => ({ getCatalogHowItWorksMock: vi.fn() }));

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return { ...actual, getCatalogHowItWorks: getCatalogHowItWorksMock };
});

const HOW_IT_WORKS: CatalogHowItWorks = {
  content: { heroTitle: 'How It Works', heroSubtitle: 'Book in three easy steps', metaTitle: null, metaDescription: null },
  steps: [
    { id: 'step-1', title: 'Choose a Deal', description: 'Browse and pick the massage deal you want.', icon: 'search', sortOrder: 0 },
    { id: 'step-2', title: 'Book a Slot', description: 'Select your preferred date and time.', icon: null, sortOrder: 1 },
  ],
};

/** Reads a custom-element prop whether React set it as a property or an attribute. */
const prop = (el: Element, name: string) => (el as unknown as Record<string, string>)[name] ?? el.getAttribute(name);

const stepCards = () => Array.from(document.querySelectorAll('ol sky-tile-card'));

const renderPage = () =>
  render(
    <MemoryRouter>
      <HowItWorks />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: public How it works page (StaticPage frame)
 * Scenario: CMS hero and ordered steps from `GET /catalog/how-it-works`, as an ordered list.
 *
 * Edge cases:
 * - a step without an icon uses the default step icon
 * - zero CMS steps, or a failed fetch, shows the home page's default steps
 */
describe('HowItWorks (public page)', () => {
  it('renders a loading state before the fetch resolves', () => {
    getCatalogHowItWorksMock.mockReturnValue(new Promise(vi.fn()));
    renderPage();

    expect(screen.getByRole('status').textContent).toBe(content.staticPage.loading);
  });

  it('renders the CMS hero and every step in order inside an ordered list', async () => {
    getCatalogHowItWorksMock.mockResolvedValue({ data: HOW_IT_WORKS });
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'How It Works' })).toBeTruthy();
    expect(screen.getByText('Book in three easy steps')).toBeTruthy();
    expect(stepCards().map((el) => prop(el, 'headline'))).toEqual(['Choose a Deal', 'Book a Slot']);
  });

  it('uses the default icon for a step without one', async () => {
    getCatalogHowItWorksMock.mockResolvedValue({ data: HOW_IT_WORKS });
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'How It Works' });
    expect(prop(stepCards()[1], 'icon')).toBe(content.howItWorks.defaultStepIcon);
  });

  it('shows the default steps when the CMS has none', async () => {
    getCatalogHowItWorksMock.mockResolvedValue({ data: { ...HOW_IT_WORKS, steps: [] } });
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'How It Works' });
    expect(stepCards().map((el) => prop(el, 'headline'))).toEqual(content.home.howItWorks.steps.map((s) => s.title));
  });

  it('falls back to the default copy when the fetch fails', async () => {
    getCatalogHowItWorksMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: content.howItWorks.title })).toBeTruthy();
    expect(stepCards()).toHaveLength(content.home.howItWorks.steps.length);
  });
});
