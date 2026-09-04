import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VendorReviewStep } from './vendor-wizard-review';
import type { AdminTherapist, Branch, Vendor, VendorCategoryAccessRow, VendorProduct } from '../../../../api/rbac/vendors';

function baseVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-1',
    businessName: 'Test Spa',
    slug: 'test-spa',
    ownerUserId: 'user-1',
    kycStatus: 'PENDING',
    kycRejectionReason: null,
    status: 'PENDING_VERIFICATION',
    statusReason: null,
    createdByUserId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    offersService: false,
    offersProduct: false,
    offersTherapy: false,
    owner: { id: 'user-1', name: 'Ada Owner', status: 'active', roles: [] },
    businessEmail: 'ada@example.com',
    address: '123 Main St',
    gstNumber: 'GST123',
    panNumber: 'PAN123',
    kycDocuments: [{ type: 'GST Certificate', url: 'https://example.com/gst.pdf' }],
    ...overrides,
  } as Vendor;
}

const READY_BRANCH: Branch = {
  id: 'branch-1',
  vendorId: 'vendor-1',
  name: 'Main Branch',
  state: 'Maharashtra',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const SERVICE_CATEGORY = { id: 'svc-1', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' as const };
const PRODUCT_CATEGORY = { id: 'prod-1', name: 'Oils', slug: 'oils', parentId: null, isActive: true, type: 'PRODUCT' as const };

function accessRow(category: typeof SERVICE_CATEGORY): VendorCategoryAccessRow {
  return { id: `access-${category.id}`, vendorId: 'vendor-1', categoryId: category.id, createdAt: '2026-01-01T00:00:00Z', category };
}

function renderReview(overrides: Partial<React.ComponentProps<typeof VendorReviewStep>> = {}) {
  return render(
    <VendorReviewStep
      vendor={baseVendor()}
      branches={[]}
      categoryAccess={[]}
      dealCount={0}
      therapists={[]}
      products={[]}
      {...overrides}
    />,
  );
}

function checklistItemStatus(label: string): string {
  const item = screen.getByText(label).closest('li');
  if (!item) throw new Error(`Checklist item "${label}" not found`);
  return item.querySelector('.status-pill')?.textContent ?? '';
}

/**
 * Feature: Vendor onboarding Step 6 — Review & Submit
 * Scenario: the completeness checklist accurately reflects what's still missing before a vendor
 * can be approved — this is the client-side extension of msd-api's `submitForVerification` gate.
 *
 * Given: a vendor missing one or more of {branch/state, KYC doc, business profile fields, a
 * module, or a granted category for an enabled module}
 * When: Step 6 renders
 * Then: exactly the missing items are flagged "Missing", everything else "Done", and the overall
 *       "ready for approval" state matches
 *
 * Edge cases:
 * - no branch at all
 * - a module enabled but zero categories granted for it ("module without category")
 * - fully complete vendor -> every item "Done", ready message shown
 */
describe('VendorReviewStep — completeness checklist', () => {
  it('flags "no branch" as Missing when there are zero branches', () => {
    renderReview({ branches: [] });
    expect(checklistItemStatus('At least one branch with a state set')).toBe('Missing');
  });

  it('flags "no branch" as Missing when a branch exists but has no state set', () => {
    renderReview({ branches: [{ ...READY_BRANCH, state: null }] });
    expect(checklistItemStatus('At least one branch with a state set')).toBe('Missing');
  });

  it('marks "branch with state" Done once a branch with a state exists', () => {
    renderReview({ branches: [READY_BRANCH] });
    expect(checklistItemStatus('At least one branch with a state set')).toBe('Done');
  });

  it('flags "no business module enabled" as Missing when every module flag is false', () => {
    renderReview({ vendor: baseVendor({ offersService: false, offersProduct: false, offersTherapy: false }) });
    expect(checklistItemStatus('At least one business module enabled')).toBe('Missing');
  });

  // The core "module without category" scenario the plan calls out explicitly.
  it('flags "module without category" as Missing: offersService=true but zero granted Service categories', () => {
    renderReview({
      vendor: baseVendor({ offersService: true }),
      categoryAccess: [],
    });
    expect(checklistItemStatus('At least one business module enabled')).toBe('Done');
    expect(checklistItemStatus('At least one granted Service category')).toBe('Missing');
  });

  it('only shows a module-specific checklist row for modules that are actually enabled', () => {
    renderReview({ vendor: baseVendor({ offersService: true, offersProduct: false, offersTherapy: false }) });
    expect(screen.getByText('At least one granted Service category')).toBeTruthy();
    expect(screen.queryByText('At least one granted Product category')).toBeNull();
    expect(screen.queryByText('At least one granted Therapy category')).toBeNull();
  });

  it('marks a module\'s category requirement Done once a category of the matching type is granted', () => {
    renderReview({
      vendor: baseVendor({ offersService: true, offersProduct: true }),
      categoryAccess: [accessRow(SERVICE_CATEGORY)],
    });
    expect(checklistItemStatus('At least one granted Service category')).toBe('Done');
    // Product module is also enabled but has no grant yet.
    expect(checklistItemStatus('At least one granted Product category')).toBe('Missing');
  });

  it('flags missing KYC document as Missing', () => {
    renderReview({ vendor: baseVendor({ kycDocuments: [] }) });
    expect(checklistItemStatus('At least one KYC document uploaded (GST, PAN, or Aadhaar)')).toBe('Missing');
  });

  it('flags incomplete business profile fields as Missing', () => {
    renderReview({ vendor: baseVendor({ gstNumber: undefined, panNumber: undefined }) });
    expect(checklistItemStatus('Business name, email, address, GST and PAN filled in')).toBe('Missing');
  });

  it('is fully "Done" and shows the ready message when every requirement is satisfied', () => {
    renderReview({
      vendor: baseVendor({ offersService: true, offersProduct: true }),
      branches: [READY_BRANCH],
      categoryAccess: [accessRow(SERVICE_CATEGORY), accessRow(PRODUCT_CATEGORY)],
    });
    for (const label of [
      'Business name, email, address, GST and PAN filled in',
      'At least one KYC document uploaded (GST, PAN, or Aadhaar)',
      'At least one branch with a state set',
      'At least one business module enabled',
      'At least one granted Service category',
      'At least one granted Product category',
    ]) {
      expect(checklistItemStatus(label)).toBe('Done');
    }
    expect(screen.getByText('This vendor is ready for approval.')).toBeTruthy();
  });

  it('renders the Approve action (present but gated) while the checklist is incomplete, with no "ready" message', () => {
    renderReview({ canApprove: true, canReject: true, onApprove: vi.fn(), onReject: vi.fn() });
    const approveButton = Array.from(document.querySelectorAll('md-filled-button')).find((el) =>
      (el.textContent ?? '').includes('Approve vendor'),
    );
    expect(approveButton).toBeTruthy();
    expect(screen.queryByText('This vendor is ready for approval.')).toBeNull();
  });

  it('shows the "ready for approval" state once the checklist is fully complete, when the caller has no approve/reject permission', () => {
    renderReview({
      vendor: baseVendor({ offersService: true }),
      branches: [READY_BRANCH],
      categoryAccess: [accessRow(SERVICE_CATEGORY)],
    });
    expect(screen.getByText('This vendor is ready for approval.')).toBeTruthy();
  });

  it('shows the "complete the missing items" hint when the caller has no approve/reject permission and the checklist is incomplete', () => {
    renderReview();
    expect(screen.getByText('Complete the missing items above before this vendor can be approved.')).toBeTruthy();
  });
});
