import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogTherapist } from '../../../api/catalog';
import content from '../../../content.json';
import { ApiRequestError } from '../../../api/rbac/client';
import { TherapistDetail } from './therapist-detail';

const m = vi.hoisted(() => ({
  therapist: vi.fn(),
  therapists: vi.fn(),
  vendor: vi.fn(),
  path: '',
}));
vi.mock('../../../api/catalog', () => ({
  getCatalogTherapist: () => m.therapist(),
  listCatalogTherapists: () => m.therapists(),
  getCatalogVendor: () => m.vendor(),
}));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ isAuthenticated: false, token: null }) }));

const THERAPIST = {
  id: 't1',
  therapistType: 'Deep Tissue Therapist',
  personName: 'Meera Kapoor',
  gender: null,
  experienceYears: 9,
  specialization: 'Sports recovery',
  bio: 'Calm, precise sessions.',
  packages: [
    { id: 'p30', durationMinutes: 30, sellingPrice: '1099', originalPrice: '1299' },
    { id: 'p60', durationMinutes: 60, sellingPrice: '1499', originalPrice: null },
  ],
  vendor: { id: 'v1', slug: 'vitality', businessName: 'Vitality Wellness', city: 'Delhi', logoUrl: null },
  branch: { id: 'b1', name: 'GK Branch', city: 'New Delhi', address: 'Greater Kailash', latitude: null, longitude: null },
  mediaImages: [],
  popularTags: [],
} as unknown as CatalogTherapist;

const t = content.therapistDetail;
const d = content.detailPage;

function PathProbe() {
  const { pathname, search } = useLocation();
  m.path = pathname + search;
  return null;
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/therapist/t1']}>
      <Routes>
        <Route path="/therapist/:id" element={<TherapistDetail />} />
        <Route path="*" element={null} />
      </Routes>
      <PathProbe />
    </MemoryRouter>,
  );

beforeEach(() => {
  m.therapist.mockResolvedValue({ data: THERAPIST });
  m.therapists.mockResolvedValue({ data: [THERAPIST, { ...THERAPIST, id: 't2', personName: 'Arjun Rao' }] });
  m.vendor.mockResolvedValue({ data: { branches: [] } });
});

/**
 * Feature: therapist detail laid out like a service deal (shared `detail-page` blocks).
 * Edge cases: price follows the chosen package; a signed-out visitor goes to sign in from
 * Add to cart; the related rail leaves out the therapist on the page.
 */
describe('TherapistDetail', () => {
  it('shows the type as h1, the facts, packages, details and the member rail', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Deep Tissue Therapist' })).toBeTruthy();
    expect(screen.getByText('Meera Kapoor')).toBeTruthy();
    expect(screen.getByText(t.experience.replace('{years}', '9'))).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: d.details })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: d.locationAndHours })).toBeTruthy();
    const rail = await screen.findByRole('heading', { level: 2, name: t.related.replace('{vendor}', 'Vitality Wellness') });
    expect(rail).toBeTruthy();
    // The rail leaves out the therapist on the page.
    const cards = Array.from(document.querySelectorAll('sky-product-card')).map((el) => el.getAttribute('href') ?? (el as unknown as { href?: string }).href);
    expect(cards).toEqual(['/therapist/t2']);
  });

  it('prices the chosen package', async () => {
    renderPage();
    const group = await screen.findByRole('group', { name: d.packageList });
    fireEvent.click(within(group).getAllByRole('button')[1]);
    expect(screen.getAllByText('₹1,499').length).toBeGreaterThan(0);
  });

  it('sends a signed-out visitor to sign in from Add to cart', async () => {
    renderPage();
    fireEvent.click(await screen.findByText(d.addToCart));
    expect(m.path).toMatch(/^\/sign-in\?next=/);
  });

  it('shows the not-found state for a missing therapist', async () => {
    m.therapist.mockRejectedValue(new ApiRequestError('NOT_FOUND', 'Not found', 404));
    renderPage();
    expect(await screen.findByText(t.notFound.cta)).toBeTruthy();
    const card = document.querySelector('sky-info-card') as HTMLElement & { heading?: string };
    expect(card.heading ?? card.getAttribute('heading')).toBe(t.notFound.heading);
  });
});
