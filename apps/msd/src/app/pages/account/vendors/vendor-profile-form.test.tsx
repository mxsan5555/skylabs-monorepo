import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';

// `vi.mock` calls are hoisted above all imports — this runs before `VendorDocumentUpload`'s own
// `../../api/rbac/vendors` import resolves (same convention as media-uploader.test.tsx).
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    uploadMyKycDocument: vi.fn(),
    deleteMyKycDocument: vi.fn(),
    uploadVendorKycDocument: vi.fn(),
    deleteVendorKycDocument: vi.fn(),
  };
});

import { VendorProfileForm } from './vendor-profile-form';

const BASE_VENDOR: Vendor = {
  id: 'vendor-1',
  businessName: 'Glow Beauty Studio',
  slug: 'glow-beauty-studio',
  ownerUserId: 'user-1',
  kycStatus: 'PENDING',
  kycRejectionReason: null,
  status: 'PROFILE_INCOMPLETE',
  statusReason: null,
  createdByUserId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  offersService: true,
  offersProduct: false,
  offersTherapy: false,
  owner: null,
  businessEmail: 'glow@example.com',
  businessPhone: '9876543210',
  // Bank section already has real, saved data — this is the "hidden section with real data"
  // that must NEVER ride along in a save scoped to a different, visible section only.
  bankAccountHolder: 'Priya Sharma',
  bankName: 'HDFC Bank',
  bankAccountNumber: '1234567890',
  bankIfsc: 'HDFC0001234',
};

/**
 * Feature: VendorProfileForm — scoped save (the actual root-cause fix for Step 1's "Invalid
 * request body")
 * Scenario: a save must submit ONLY the fields belonging to the currently visible `sections`,
 * never the whole form state — previously `handleSave` validated only the visible section but
 * submitted every section's value regardless, so a hidden section's data (complete or
 * incomplete) rode along in every save.
 *
 * Given: a Vendor with real Bank Details already saved, rendered with `sections={['business']}`
 *        only (mirrors the tabbed self-service editor saving one tab at a time)
 * When: the Business tab is saved
 * Then: the submitted payload contains only Business fields — no bankAccountHolder/bankName/etc.
 *
 * Edge cases:
 * - the Save/Create-Vendor button is disabled until every required field in the visible
 *   section(s) is filled, plus (when the KYC section is shown) at least one document
 * - a brand-new vendor (no KYC document yet) keeps Create Vendor disabled even with every other
 *   field filled
 */
describe('VendorProfileForm — scoped save (Part 2 root-cause fix)', () => {
  it('a save scoped to sections=["business"] submits only business fields, never the hidden Bank section\'s real data', async () => {
    const onSave = vi.fn();
    render(
      <VendorProfileForm
        vendor={BASE_VENDOR}
        canEdit
        canReviewKyc={false}
        saving={false}
        token="tok"
        sections={['business']}
        onSave={onSave}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save profile'));
      if (!button) throw new Error('Save button not found');
      return button as HTMLElement;
    });
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const submitted = onSave.mock.calls[0][0];
    expect(submitted).not.toHaveProperty('bankAccountHolder');
    expect(submitted).not.toHaveProperty('bankName');
    expect(submitted).not.toHaveProperty('bankAccountNumber');
    expect(submitted).not.toHaveProperty('bankIfsc');
    expect(submitted.businessName).toBe('Glow Beauty Studio');
  });

  it('a save scoped to sections=["bank"] submits only bank fields, never business/owner/address data', async () => {
    const onSave = vi.fn();
    render(
      <VendorProfileForm
        vendor={BASE_VENDOR}
        canEdit
        canReviewKyc={false}
        saving={false}
        token="tok"
        sections={['bank']}
        onSave={onSave}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save profile'));
      if (!button) throw new Error('Save button not found');
      return button as HTMLElement;
    });
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const submitted = onSave.mock.calls[0][0];
    expect(submitted).not.toHaveProperty('businessName');
    expect(submitted).not.toHaveProperty('businessEmail');
    expect(submitted.bankAccountHolder).toBe('Priya Sharma');
  });
});

describe('VendorProfileForm — Create Vendor button gating', () => {
  // NOTE: asserting the `disabled` JS property directly isn't reliable here — this repo's
  // installed `@lit/react@1.0.8` property-binding under React 19.2.7 + jsdom has the same
  // documented timing gap noted elsewhere in this test suite (search.test.tsx's own doc
  // comment). Verified behaviorally instead: clicking the button while required data is missing
  // must never reach `onSave`.
  it('a click on Create Vendor for a brand-new, empty vendor never calls onSave (blocked by missing required fields + no KYC document)', async () => {
    const onSave = vi.fn();
    render(
      <VendorProfileForm
        vendor={null}
        canEdit
        canReviewKyc={false}
        saving={false}
        token="tok"
        selfService
        sections={['business', 'owner', 'address', 'kyc']}
        onSave={onSave}
      />,
    );

    const createButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Create vendor'));
      if (!button) throw new Error('Create vendor button not found');
      return button as HTMLElement;
    });
    fireEvent.click(createButton);
    // Give any (incorrect) async submit a tick to fire before asserting it never did.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('an existing, fully-complete vendor with a real KYC document keeps Save enabled', async () => {
    const completeVendor: Vendor = {
      ...BASE_VENDOR,
      ownerFirstName: 'Priya',
      ownerLastName: 'Sharma',
      ownerMobile: '9876543211',
      ownerEmail: 'priya@example.com',
      address: '123 Main St',
      city: 'Gorakhpur',
      state: 'Uttar Pradesh',
      pincode: '273001',
      latitude: 26.76,
      longitude: 83.37,
      documents: [{ id: 'doc-1', documentType: 'GST', originalFilename: 'gst.pdf', mimeType: 'application/pdf', sizeBytes: 1024, createdAt: '2026-01-01T00:00:00Z' }],
    };
    render(
      <VendorProfileForm
        vendor={completeVendor}
        canEdit
        canReviewKyc={false}
        saving={false}
        token="tok"
        selfService
        sections={['business', 'owner', 'address', 'kyc']}
        onSave={vi.fn()}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save profile'));
      if (!button) throw new Error('Save button not found');
      return button as HTMLElement & { disabled?: boolean };
    });
    expect(saveButton.disabled).toBe(false);
  });

  it('never renders Legal Name / Business Type / GST / PAN text fields — KYC is file upload only', () => {
    render(
      <VendorProfileForm
        vendor={BASE_VENDOR}
        canEdit
        canReviewKyc={false}
        saving={false}
        token="tok"
        sections={['business', 'kyc']}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByText('Legal name')).toBeNull();
    expect(screen.queryByText('Business type')).toBeNull();
    expect(screen.queryByText('GST number')).toBeNull();
    expect(screen.queryByText('PAN number')).toBeNull();
    expect(screen.queryByText('Document URL')).toBeNull();
    expect(screen.getByText('GST Certificate')).toBeTruthy();
    expect(screen.getByText('PAN Card')).toBeTruthy();
    expect(screen.getByText('Aadhaar Card')).toBeTruthy();
  });
});
