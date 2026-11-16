import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogCareers } from '../../../api/catalog';
import { Careers } from './careers';
import content from '../../../content.json';

const { getCatalogCareersMock } = vi.hoisted(() => ({ getCatalogCareersMock: vi.fn() }));

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return { ...actual, getCatalogCareers: getCatalogCareersMock };
});

const CAREERS: CatalogCareers = {
  content: { heroTitle: 'Careers', heroSubtitle: 'Join our team', metaTitle: null, metaDescription: null },
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <Careers />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: public Careers page (StaticPage frame)
 * Scenario: CMS hero copy and every published job from `GET /catalog/careers`; a job shows an
 * Apply now button when `applyUrl` is set, otherwise its `applyInstructions`.
 *
 * Edge cases:
 * - zero open roles renders the empty-state line
 * - a fetch failure falls back to the content.json title and the empty state, never an error
 */
describe('Careers (public page)', () => {
  it('renders a loading state before the fetch resolves', () => {
    getCatalogCareersMock.mockReturnValue(new Promise(vi.fn()));
    renderPage();

    expect(screen.getByRole('status').textContent).toBe(content.staticPage.loading);
  });

  it('renders the CMS hero and every job as an h3', async () => {
    getCatalogCareersMock.mockResolvedValue({ data: CAREERS });
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Careers' })).toBeTruthy();
    expect(screen.getByText('Join our team')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Massage Therapist' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Front Desk Executive' })).toBeTruthy();
    expect(screen.getByText('Operations · Bengaluru · Full-time')).toBeTruthy();
  });

  it('links Apply now to applyUrl, and shows applyInstructions when there is no URL', async () => {
    getCatalogCareersMock.mockResolvedValue({ data: CAREERS });
    renderPage();

    const apply = (await screen.findByText(content.careers.apply)) as HTMLElement & { href?: string };
    expect(apply.tagName).toBe('MD-FILLED-BUTTON');
    expect(apply.getAttribute('href') ?? apply.href).toBe('https://example.com/apply');
    expect(screen.getAllByText(content.careers.apply)).toHaveLength(1);
    expect(screen.getByText('Email your resume to careers@skylabs.dev')).toBeTruthy();
  });

  it('renders the empty state when there are no open roles', async () => {
    getCatalogCareersMock.mockResolvedValue({ data: { ...CAREERS, jobs: [] } });
    renderPage();

    expect(await screen.findByText(content.careers.empty)).toBeTruthy();
  });

  it('falls back to the default copy when the fetch fails', async () => {
    getCatalogCareersMock.mockRejectedValue(new Error('network down'));
    renderPage();

    expect(await screen.findByText(content.careers.empty)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: content.careers.title })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
