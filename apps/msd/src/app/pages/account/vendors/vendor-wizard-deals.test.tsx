import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { VendorDealsStep } from './vendor-wizard-deals';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderStep(props: Partial<{ vendorId: string; branchCount: number; dealCount: number }> = {}) {
  return render(
    <MemoryRouter>
      <VendorDealsStep vendorId="v1" branchCount={1} dealCount={0} {...props} />
    </MemoryRouter>,
  );
}

/**
 * Feature: Onboarding wizard Step 3 is now a read-only recap, not a second place to create/edit
 * deals (that's `DealsListPage`/`DealFormPage` now — see `vendor-wizard-branches.tsx`'s own doc
 * comment for the full rationale).
 */
describe('VendorDealsStep', () => {
  it('always offers a "Manage deals" link out to the real Deals page', () => {
    renderStep();
    const button = screen.getByText('Manage deals');
    fireEvent.click(button);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/deals');
  });

  it('shows a hint to add a branch first when there are no branches yet', () => {
    renderStep({ branchCount: 0 });
    expect(screen.getByText('Add a branch in Step 2 before adding deals.')).toBeTruthy();
  });

  it('shows the real deal count once a branch exists', () => {
    renderStep({ branchCount: 2, dealCount: 5 });
    expect(screen.getByText("5 deals across this vendor's branches.")).toBeTruthy();
  });

  it('uses singular copy for exactly one deal', () => {
    renderStep({ branchCount: 1, dealCount: 1 });
    expect(screen.getByText("1 deal across this vendor's branches.")).toBeTruthy();
  });
});
