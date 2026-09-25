import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCareers } from '../../../api/catalog';

const getCatalogCareersMock = vi.fn();

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return {
    ...actual,
    getCatalogCareers: (...args: unknown[]) => getCatalogCareersMock(...args),
  };
});

import { Careers } from './careers';

const CAREERS: CatalogCareers = {
  content: {
    heroTitle: 'Careers',
    heroSubtitle: 'Join our team',
    metaTitle: null,
    metaDescription: null,
  },
  jobs: [
    {
      id: 'job-1',
      jobTitle: 'Massage Therapist',
      department: 'Operations',
      location: 'Bengaluru',
      employmentType: 'Full-time',
      description: 'Provide massage services to customers.',
      responsibilities: 'Deliver excellent massage sessions.',
      requirements: 'Certified therapist with 2+ years experience.',
      applyUrl: 'https://example.com/apply',
      applyInstructions: null,
    },
    {
      id: 'job-2',
      jobTitle: 'Front Desk Executive',
      department: 'Operations',
      location: 'Mumbai',
      employmentType: 'Part-time',
      description: 'Greet and assist walk-in customers.',
      responsibilities: 'Manage bookings and front desk operations.',
      requirements: 'Good communication skills.',
      applyUrl: null,
      applyInstructions: 'Email your resume to careers@skylabs.dev',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: public Careers page
 * Scenario: renders the CMS-managed hero copy plus every PUBLISHED job listing from
 * `GET /catalog/careers`, with an "Apply now" link when `applyUrl` is set or freeform
 * `applyInstructions` text otherwise — never both.
 *
 * Given: a mocked `getCatalogCareers` response
 * When: the page mounts
 * Then: the hero and every job card render with the correct apply affordance per job
 *
 * Edge cases:
 * - zero open roles renders an empty-state message, not an error
 * - a fetch failure renders an error message instead of crashing
 */
describe('Careers (public page)', () => {
  it('renders a loading state before the fetch resolves', () => {
    getCatalogCareersMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<Careers />);

    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('renders the hero copy and every job listing on successful load', async () => {
    getCatalogCareersMock.mockResolvedValue({ data: CAREERS });
    render(<Careers />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Careers' })).toBeTruthy();
    expect(screen.getByText('Join our team')).toBeTruthy();
    expect(screen.getByText('Massage Therapist')).toBeTruthy();
    expect(screen.getByText('Front Desk Executive')).toBeTruthy();
  });

  it('shows "Apply now" linking to applyUrl when set, not the freeform instructions', async () => {
    getCatalogCareersMock.mockResolvedValue({ data: CAREERS });
    render(<Careers />);

    await screen.findByText('Massage Therapist');
    const applyLink = screen.getByText('Apply now').closest('a');
    expect(applyLink?.getAttribute('href')).toBe('https://example.com/apply');
  });

  it('falls back to freeform applyInstructions when applyUrl is not set', async () => {
    getCatalogCareersMock.mockResolvedValue({ data: CAREERS });
    render(<Careers />);

    expect(await screen.findByText('Email your resume to careers@skylabs.dev')).toBeTruthy();
  });

  it('renders an empty-state message when there are no open roles (empty state)', async () => {
    getCatalogCareersMock.mockResolvedValue({ data: { ...CAREERS, jobs: [] } });
    render(<Careers />);

    expect(await screen.findByText('There are no open roles right now — check back soon.')).toBeTruthy();
  });

  it('renders an error message instead of crashing when the fetch fails (error state)', async () => {
    getCatalogCareersMock.mockRejectedValue(new Error('network down'));
    render(<Careers />);

    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
