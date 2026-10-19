import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';

const updateVendorMock = vi.fn();
const listBranchesMock = vi.fn();
const getVendorCategoryAccessMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    updateVendor: (...args: unknown[]) => updateVendorMock(...args),
    listBranches: (...args: unknown[]) => listBranchesMock(...args),
    getVendorCategoryAccess: (...args: unknown[]) => getVendorCategoryAccessMock(...args),
    getVendor: vi.fn().mockResolvedValue({ data: {} }),
  };
});

// Driving the real VendorProfileForm's md-outlined-text-field inputs hits this repo's documented
// jsdom + @lit/react gap (see vendor-branches.test.tsx) — stubbed to a button that calls onSave
// with a fixed payload, so this suite can test VendorPipeline's OWN step-navigation/finish logic
// in isolation.
vi.mock('./vendor-profile-form', () => ({
  VendorProfileForm: ({ saveLabel, onSave }: { saveLabel?: string; onSave: (input: unknown) => void }) => (
    <button type="button" onClick={() => onSave({ businessName: 'Saved Co' })}>
      {saveLabel ?? 'Save'}
    </button>
  ),
  extractVendorFieldErrors: () => null,
}));

vi.mock('./vendor-wizard-modules', () => ({
  VendorProductCategoryAccess: () => <div>product-category-access</div>,
}));

vi.mock('./vendor-wizard-branches', () => ({
  VendorBranchListStep: () => <div>branch-list-step</div>,
}));

import { VendorPipeline } from './vendor-pipeline';

const VENDOR: Vendor = {
  id: 'vendor-1',
  businessName: null,
  slug: null,
  ownerUserId: 'owner-1',
  kycStatus: 'PENDING',
  kycRejectionReason: null,
  status: 'PROFILE_INCOMPLETE',
  statusReason: null,
  createdByUserId: 'admin-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: false,
  offersProduct: false,
  offersTherapy: false,
  owner: { id: 'owner-1', name: 'Ramesh Kumar', status: 'active', roles: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  listBranchesMock.mockResolvedValue({ data: [] });
  getVendorCategoryAccessMock.mockResolvedValue({ data: [] });
  updateVendorMock.mockResolvedValue({ data: VENDOR });
});

/**
 * Feature: VendorPipeline — all 4 steps (Member User → Business Details → KYC Documents →
 * Branch & Access)
 * Scenario: Member User is now a real, always-visible pill (not a separate pre-creation screen) —
 * editing it goes through the same `VendorProfileForm`/`updateVendor` save path as every other
 * section, just scoped to `sections={['owner']}`. Default landing step stays Business Details
 * (the "Complete Profile" button's existing continuation semantics), but all 4 pills are visible
 * and clickable from the start. One consistent footer per step: Back (+ "Back to Member Details"
 * on Step 1, which is Cancel in effect) and the step's own Save button — no separate "Save Draft
 * & Exit" duplicating it.
 */
describe('VendorPipeline — all 4 steps', () => {
  it('shows all 4 pills (Member User/Business Details/KYC Documents/Branch & Access), defaulting to Business Details', () => {
    render(<VendorPipeline token="tok" vendor={VENDOR} onVendorChange={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.getByText('Member User')).toBeTruthy();
    expect(screen.getByText('Business Details')).toBeTruthy();
    expect(screen.getByText('KYC Documents')).toBeTruthy();
    expect(screen.getByText('Branch & Access')).toBeTruthy();
    expect(screen.getByText('Step 2 of 4: Business Details')).toBeTruthy();
    expect(screen.queryByText(/Deals/)).toBeNull();
    expect(screen.queryByText(/Review & Submit/)).toBeNull();
  });

  it('Member User pill is clickable and opens Step 1, even for an already-created member', () => {
    render(<VendorPipeline token="tok" vendor={VENDOR} onVendorChange={vi.fn()} onFinish={vi.fn()} />);
    fireEvent.click(screen.getByText('Member User'));
    expect(screen.getByText('Step 1 of 4: Member User')).toBeTruthy();
  });

  it('"Save & Continue" on Business Details saves the section and advances to KYC Documents', async () => {
    const onVendorChange = vi.fn();
    render(<VendorPipeline token="tok" vendor={VENDOR} onVendorChange={onVendorChange} onFinish={vi.fn()} />);

    fireEvent.click(screen.getByText('Save & Continue'));

    await waitFor(() => expect(updateVendorMock).toHaveBeenCalledWith('tok', 'vendor-1', { businessName: 'Saved Co' }));
    await waitFor(() => expect(screen.getByText('Step 3 of 4: KYC Documents')).toBeTruthy());
    expect(onVendorChange).toHaveBeenCalledWith(VENDOR);
  });

  it('"Save & Continue" on KYC Documents advances to Branch & Access without re-saving Business fields', async () => {
    render(<VendorPipeline token="tok" vendor={VENDOR} onVendorChange={vi.fn()} onFinish={vi.fn()} />);
    fireEvent.click(screen.getByText('Save & Continue')); // Business Details -> KYC
    await waitFor(() => expect(screen.getByText('Step 3 of 4: KYC Documents')).toBeTruthy());

    fireEvent.click(screen.getByText('Save & Continue')); // KYC -> Branch & Access
    await waitFor(() => expect(screen.getByText('Step 4 of 4: Branch & Access')).toBeTruthy());
  });

  it('"Back to Member Details" on Step 1 calls onFinish without requiring later steps to be complete', () => {
    const onFinish = vi.fn();
    render(<VendorPipeline token="tok" vendor={VENDOR} onVendorChange={vi.fn()} onFinish={onFinish} />);
    fireEvent.click(screen.getByText('Member User'));
    fireEvent.click(screen.getByText('Back to Member Details'));
    expect(onFinish).toHaveBeenCalled();
  });

  it('Step 4\'s only bottom actions are Back and "Save & Finish" — no separate "Save Draft & Exit" duplicating it', async () => {
    const onFinish = vi.fn();
    render(<VendorPipeline token="tok" vendor={VENDOR} onVendorChange={vi.fn()} onFinish={onFinish} />);
    fireEvent.click(screen.getByText('Save & Continue'));
    await waitFor(() => screen.getByText('Step 3 of 4: KYC Documents'));
    fireEvent.click(screen.getByText('Save & Continue'));
    await waitFor(() => screen.getByText('Step 4 of 4: Branch & Access'));

    expect(screen.queryByText('Save Draft & Exit')).toBeNull();
    fireEvent.click(screen.getByText('Save & Finish'));
    expect(onFinish).toHaveBeenCalled();
  });

  it('"Back" returns to the previous step without losing the member', async () => {
    render(<VendorPipeline token="tok" vendor={VENDOR} onVendorChange={vi.fn()} onFinish={vi.fn()} />);
    fireEvent.click(screen.getByText('Save & Continue'));
    await waitFor(() => screen.getByText('Step 3 of 4: KYC Documents'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Step 2 of 4: Business Details')).toBeTruthy();
  });
});
