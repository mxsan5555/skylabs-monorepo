import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { Branch } from '../../../../api/rbac/vendors';
import { VendorBranchListStep } from './vendor-wizard-branches';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const BRANCH_A: Branch = {
  id: 'b1',
  vendorId: 'v1',
  name: 'Lower Parel Branch',
  address: null,
  city: 'Mumbai',
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
  categoryTypes: [],
};

const BRANCH_B: Branch = { ...BRANCH_A, id: 'b2', name: 'Colaba Branch', isActive: false };

function renderStep(branches: Branch[]) {
  return render(
    <MemoryRouter>
      <VendorBranchListStep vendorId="v1" branches={branches} />
    </MemoryRouter>,
  );
}

/**
 * Feature: Onboarding wizard Step 2's branch half is now a read-only recap, not a second place
 * to create/edit branches (that's `BranchesListPage`/`BranchFormPage` now — see this file's own
 * doc comment for the full rationale).
 */
describe('VendorBranchListStep', () => {
  it('offers a "Manage branches" link out to the real Branches page', () => {
    renderStep([BRANCH_A]);
    const button = screen.getByText('Manage branches');
    fireEvent.click(button);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/branches');
  });

  it('shows the submission-readiness hint when there are no branches yet', () => {
    renderStep([]);
    expect(screen.getByText('No branches yet — add at least one branch (with a state) before this vendor can be submitted.')).toBeTruthy();
  });

  it('lists each branch read-only, with its state/city and status, and the branch/state counts', () => {
    renderStep([BRANCH_A, BRANCH_B]);
    expect(screen.getByText('2 branches across 1 state.')).toBeTruthy();
    expect(screen.getByText('Lower Parel Branch')).toBeTruthy();
    expect(screen.getByText('Colaba Branch')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });
});
