import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogHowItWorks } from '../../../api/catalog';

const getCatalogHowItWorksMock = vi.fn();

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    getCatalogHowItWorks: (...args: unknown[]) => getCatalogHowItWorksMock(...args),
  };
});

import { HowItWorks } from './how-it-works';

const HOW_IT_WORKS: CatalogHowItWorks = {
  content: {
    heroTitle: 'How It Works',
    heroSubtitle: 'Book in three easy steps',
    metaTitle: null,
    metaDescription: null,
  },
  steps: [
    { id: 'step-1', title: 'Choose a Deal', description: 'Browse and pick the massage deal you want.', icon: 'search', sortOrder: 0 },
    { id: 'step-2', title: 'Book a Slot', description: 'Select your preferred date and time.', icon: null, sortOrder: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: public How It Works page
 * Scenario: renders the CMS-managed hero copy plus every active step, ordered, from
 * `GET /catalog/how-it-works` — a step falls back to its position number when it has no chosen
 * Material Symbols icon.
 *
 * Given: a mocked `getCatalogHowItWorks` response
 * When: the page mounts
 * Then: the hero and every step render, in order, with the correct icon/number fallback
 *
 * Edge cases:
 * - zero steps renders an empty-state message, not an error
 * - a fetch failure renders an error message instead of crashing
 */
describe('HowItWorks (public page)', () => {
  it('renders a loading state before the fetch resolves', () => {
    getCatalogHowItWorksMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<HowItWorks />);

    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('renders the hero copy and every step in order', async () => {
    getCatalogHowItWorksMock.mockResolvedValue({ data: HOW_IT_WORKS });
    render(<HowItWorks />);

    expect(await screen.findByRole('heading', { level: 1, name: 'How It Works' })).toBeTruthy();
    expect(screen.getByText('Book in three easy steps')).toBeTruthy();
    const stepTitles = Array.from(document.querySelectorAll('.how-it-works__step-title')).map((el) => el.textContent);
    expect(stepTitles).toEqual(['Choose a Deal', 'Book a Slot']);
  });

  it("falls back to the step's position number when it has no chosen icon", async () => {
    getCatalogHowItWorksMock.mockResolvedValue({ data: HOW_IT_WORKS });
    render(<HowItWorks />);

    await screen.findByText('Book a Slot');
    const icons = Array.from(document.querySelectorAll('.how-it-works__step-icon'));
    // step-2 has no icon, so its span falls back to its 1-based position number ("2").
    expect(icons[1].textContent).toBe('2');
  });

  it('renders an empty-state message when there are no steps yet (empty state)', async () => {
    getCatalogHowItWorksMock.mockResolvedValue({ data: { ...HOW_IT_WORKS, steps: [] } });
    render(<HowItWorks />);

    expect(await screen.findByText('Steps are coming soon.')).toBeTruthy();
  });

  it('renders an error message instead of crashing when the fetch fails (error state)', async () => {
    getCatalogHowItWorksMock.mockRejectedValue(new Error('network down'));
    render(<HowItWorks />);

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
