import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { Branch } from '../../../../api/rbac/vendors';
import { VendorTherapistsStep } from './vendor-wizard-therapists';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const THERAPY_BRANCH: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: null,
  city: null,
  state: 'Maharashtra',
  country: null,
  pincode: null,
  latitude: null,
  longitude: null,
  mapLocationUrl: null,
  phone: null,
  email: null,
  openingHours: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  _count: { deals: 0 },
  categoryTypes: ['THERAPY'],
};

const NON_THERAPY_BRANCH: Branch = { ...THERAPY_BRANCH, id: 'b2', categoryTypes: ['SERVICE'] };

function renderStep(
  props: Partial<{ vendorId: string; offersTherapy: boolean; branches: Branch[]; therapistCount: number }> = {},
) {
  return render(
    <MemoryRouter>
      <VendorTherapistsStep vendorId="v1" offersTherapy branches={[THERAPY_BRANCH]} therapistCount={0} {...props} />
    </MemoryRouter>,
  );
}

/**
 * Feature: Onboarding wizard Step 4 is now a read-only recap, not a second place to create/edit
 * therapists (that's `TherapistsListPage`/`TherapistFormPage` now — see
 * `vendor-wizard-branches.tsx`'s own doc comment for the full rationale).
 */
describe('VendorTherapistsStep', () => {
  it('shows a "module not enabled" message when offersTherapy is false and no branch has real Therapy access', () => {
    renderStep({ offersTherapy: false, branches: [NON_THERAPY_BRANCH] });
    expect(screen.getByText('This vendor has not enabled the Therapy business module in Step 2.')).toBeTruthy();
    expect(screen.queryByText('Manage therapists')).toBeNull();
  });

  it('proceeds even with offersTherapy false, as long as some branch has real THERAPY category access — the flag is a convenience, not the ground truth', () => {
    renderStep({ offersTherapy: false, branches: [THERAPY_BRANCH] });
    expect(screen.getByText('Manage therapists')).toBeTruthy();
  });

  it('shows a hint to add a branch first when there are no branches at all', () => {
    renderStep({ branches: [] });
    expect(screen.getByText('Add a branch in Step 2 before adding therapists.')).toBeTruthy();
  });

  it('shows a hint to map Therapy access when branches exist but none have it', () => {
    renderStep({ branches: [NON_THERAPY_BRANCH], offersTherapy: true });
    expect(screen.getByText('No branch currently has Therapy category access — map one under Business Modules & Category Access first.')).toBeTruthy();
  });

  it('shows the real therapist count once a Therapy-eligible branch exists', () => {
    renderStep({ branches: [THERAPY_BRANCH], therapistCount: 4 });
    expect(screen.getByText("4 therapists across this vendor's branches.")).toBeTruthy();
  });

  it('never crashes on a branch whose categoryTypes is undefined (the exact shape a raw updateBranch/createBranch/setBranchStatus response has)', () => {
    const incompleteBranch = { ...THERAPY_BRANCH, categoryTypes: undefined } as unknown as Branch;
    expect(() => renderStep({ branches: [incompleteBranch], offersTherapy: false })).not.toThrow();
  });

  it('offers a "Manage therapists" link out to the real Therapists page', () => {
    renderStep();
    const button = screen.getByText('Manage therapists');
    fireEvent.click(button);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/therapists');
  });
});
