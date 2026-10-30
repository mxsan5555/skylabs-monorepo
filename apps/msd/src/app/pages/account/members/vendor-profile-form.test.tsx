import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';
import { listMyKycDocuments, listVendorKycDocuments } from '../../../../api/rbac/vendors';
import { VendorProfileForm, extractVendorFieldErrors } from './vendor-profile-form';

// `vi.mock` calls are hoisted above all imports, so this runs before `VendorDocumentUpload`'s own
// `../../api/rbac/vendors` import resolves (same convention as media-uploader.test.tsx).
vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    uploadMyKycDocument: vi.fn(),
    deleteMyKycDocument: vi.fn(),
    uploadVendorKycDocument: vi.fn(),
    deleteVendorKycDocument: vi.fn(),
    listMyKycDocuments: vi.fn().mockResolvedValue({ data: [] }),
    listVendorKycDocuments: vi.fn().mockResolvedValue({ data: [] }),
  };
});


const GST_FILE = {
  id: 'doc-1',
  documentType: 'GST' as const,
  fileUrl: 'https://signed.example/kyc/vendor-1/gst.pdf',
  originalFilename: 'gst.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-01-01T00:00:00Z',
};

const BASE_VENDOR: Vendor = {
  id: 'vendor-1',
  businessName: 'Glow Beauty Studio',
  slug: 'glow-beauty-studio',
  ownerUserId: 'user-1',
  kycStatus: 'PENDING',
  kycRejectionReason: null,
  status: 'ACTIVE',
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
        saving={false}
        token="tok"
        sections={['business']}
        onSave={onSave}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save changes'));
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
        saving={false}
        token="tok"
        sections={['bank']}
        onSave={onSave}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save changes'));
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
      mapLocationUrl: 'https://maps.app.goo.gl/abc123',
      latitude: 26.76,
      longitude: 83.37,
      // Member responses carry only id, type and status; the file comes from the documents endpoint.
      documents: [{ id: 'doc-1', documentType: 'GST', status: 'SUBMITTED' }],
    };
    vi.mocked(listMyKycDocuments).mockResolvedValueOnce({ data: [GST_FILE] });
    render(
      <VendorProfileForm
        vendor={completeVendor}
        canEdit
        saving={false}
        token="tok"
        selfService
        sections={['business', 'owner', 'address', 'kyc']}
        onSave={vi.fn()}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save changes'));
      if (!button) throw new Error('Save button not found');
      return button as HTMLElement & { disabled?: boolean };
    });
    expect(saveButton.disabled).toBe(false);
    expect(await screen.findByText('gst.pdf')).toBeTruthy();
    expect(listMyKycDocuments).toHaveBeenCalledWith('tok');
  });

  it('loads the KYC files for staff from the member documents endpoint, never from the member response', async () => {
    vi.mocked(listVendorKycDocuments).mockResolvedValueOnce({ data: [GST_FILE] });
    render(
      <VendorProfileForm
        vendor={{ ...BASE_VENDOR, documents: [{ id: 'doc-1', documentType: 'GST', status: 'SUBMITTED' }] }}
        canEdit
        saving={false}
        token="tok"
        sections={['kyc']}
        onSave={vi.fn()}
      />,
    );
    expect(await screen.findByText('gst.pdf')).toBeTruthy();
    expect(listVendorKycDocuments).toHaveBeenCalledWith('tok', 'vendor-1');
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('a read only form shows the KYC files but offers no upload, replace or remove', async () => {
    vi.mocked(listMyKycDocuments).mockResolvedValueOnce({ data: [GST_FILE] });
    render(<VendorProfileForm vendor={BASE_VENDOR} canEdit={false} saving={false} token="tok" selfService sections={['kyc']} onSave={vi.fn()} />);
    expect(await screen.findByText('gst.pdf')).toBeTruthy();
    expect(screen.queryByText(/^Upload (GST|PAN|Aadhaar)/)).toBeNull();
    expect(screen.queryByText(/Upload any ONE/)).toBeNull();
    expect(document.querySelector('[aria-label="Replace document"], [aria-label="Remove document"]')).toBeNull();
  });

  it('does not call the documents endpoint when the KYC section is hidden', () => {
    vi.mocked(listVendorKycDocuments).mockClear();
    vi.mocked(listMyKycDocuments).mockClear();
    render(<VendorProfileForm vendor={BASE_VENDOR} canEdit saving={false} token="tok" sections={['business']} onSave={vi.fn()} />);
    expect(listVendorKycDocuments).not.toHaveBeenCalled();
    expect(listMyKycDocuments).not.toHaveBeenCalled();
  });

  it('shows a plain member status line with no approval or completion wording', () => {
    render(
      <VendorProfileForm
        vendor={{ ...BASE_VENDOR, status: 'INACTIVE' }}
        canEdit
        saving={false}
        token="tok"
        sections={['business']}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('Status: Inactive')).toBeTruthy();
    expect(screen.queryByText(/approval/i)).toBeNull();
    expect(screen.queryByText(/profile completion/i)).toBeNull();
    expect(screen.queryByText(/submit for verification/i)).toBeNull();
  });

  it('never renders Legal Name / Business Type / GST / PAN text fields — KYC is file upload only', () => {
    render(
      <VendorProfileForm
        vendor={BASE_VENDOR}
        canEdit
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

/**
 * Feature: VendorProfileForm — a stale error left on a tab that's no longer visible must never
 * poison Save on a DIFFERENT tab (the actual root cause of "Save button stays disabled after an
 * error with no way to retry" — `vendor-profile-tabs.tsx` reuses ONE `VendorProfileForm` instance
 * across every tab, and `errors` state is only reset when the `vendor` identity changes, never on
 * a tab switch, so a server/inline error recorded for a field that isn't part of the currently
 * visible `sections` used to keep `canSubmit` false everywhere, with no visible message anywhere
 * to explain why.
 */
describe('VendorProfileForm — a stale other-section error never blocks the current section\'s Save', () => {
  it('an ownerMobile error left over from the Owner tab does not disable Save once the Business tab (with valid data) is shown', async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <VendorProfileForm
        vendor={BASE_VENDOR}
        canEdit
        saving={false}
        token="tok"
        sections={['owner']}
        serverFieldErrors={{ ownerMobile: 'Enter a valid 10-digit mobile number' }}
        onSave={onSave}
      />,
    );
    await waitFor(() => expect(screen.getByText('Enter a valid 10-digit mobile number')).toBeTruthy());

    // Simulate switching tabs — the SAME VendorProfileForm instance, just a different `sections`
    // prop, exactly like vendor-profile-tabs.tsx does (no `key` change, so React reuses state).
    rerender(
      <VendorProfileForm
        vendor={BASE_VENDOR}
        canEdit
        saving={false}
        token="tok"
        sections={['business']}
        serverFieldErrors={{ ownerMobile: 'Enter a valid 10-digit mobile number' }}
        onSave={onSave}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save changes'));
      if (!button) throw new Error('Save button not found');
      return button as HTMLElement & { disabled?: boolean };
    });
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});

/**
 * Feature: VendorProfileForm — Map Location URL replaces directly-editable latitude/longitude
 * `latitude`/`longitude` are no longer client-editable — the Address section now takes a single
 * pasted Google Maps URL (`mapLocationUrl`), which the server resolves into coordinates (see
 * `googleMapsUrlResolver.provider.ts` in msd-api). `Vendor.latitude`/`longitude` remain on the
 * read shape (still returned, still Decimal-as-string over JSON) but are display-only now.
 */
describe('VendorProfileForm — Map Location URL', () => {
  it('saving the Address tab submits the pasted mapLocationUrl, never a latitude/longitude pair', async () => {
    const vendorWithLocation: Vendor = {
      ...BASE_VENDOR,
      address: '123 Main St',
      city: 'Gorakhpur',
      state: 'Uttar Pradesh',
      pincode: '273001',
      mapLocationUrl: 'https://maps.app.goo.gl/abc123',
      // Still present on the read shape (Decimal-as-string over JSON) but purely display data now.
      latitude: '26.7606' as unknown as number,
      longitude: '83.3732' as unknown as number,
    };
    const onSave = vi.fn();
    render(
      <VendorProfileForm
        vendor={vendorWithLocation}
        canEdit
        saving={false}
        token="tok"
        sections={['address']}
        onSave={onSave}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save changes'));
      if (!button) throw new Error('Save button not found');
      return button as HTMLElement & { disabled?: boolean };
    });
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const submitted = onSave.mock.calls[0][0];
    expect(submitted.mapLocationUrl).toBe('https://maps.app.goo.gl/abc123');
    expect(submitted).not.toHaveProperty('latitude');
    expect(submitted).not.toHaveProperty('longitude');
  });

  it('renders Address 1/2, PIN and Map Location as text fields and State and City as lists — never a Latitude/Longitude field', () => {
    render(
      <VendorProfileForm
        vendor={BASE_VENDOR}
        canEdit
        saving={false}
        token="tok"
        sections={['address']}
        onSave={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(4);
    expect(Array.from(document.querySelectorAll('md-outlined-select')).map((el) => (el as HTMLElement & { label: string }).label)).toEqual(['State', 'City']);
    expect(screen.queryByText('Latitude')).toBeNull();
    expect(screen.queryByText('Longitude')).toBeNull();
  });

  /**
   * The resolver's rejection (`ApiError('VALIDATION_ERROR', message)`, thrown with no
   * `details.fieldErrors` — it's a single hand-written message, not a Zod field-error map) must
   * NOT be picked up by `extractVendorFieldErrors` — if it were, the parent page (see
   * `useMyVendor.save` in `vendors.tsx`, all 4 `VendorProfileForm` call sites) would wrongly
   * clear its own generic-banner `error` and show nothing there, while also never actually
   * wiring `errors.mapLocationUrl` inline (unlike `BranchDialog`, `VendorProfileForm` has no such
   * per-field catch of its own). Confirms the resolver's message instead only ever reaches the
   * caller's generic `{error && <p role="alert">{error}</p>}` banner (see e.g.
   * `vendor-business-profile.tsx`), which every one of the 4 call sites already renders from
   * `err.message` on any `ApiRequestError`, regardless of `details`.
   */
  it('extractVendorFieldErrors returns null for a resolver VALIDATION_ERROR (no fieldErrors) — it surfaces via the generic banner, not an inline field error', () => {
    const resolverError = new ApiRequestError(
      'VALIDATION_ERROR',
      "We couldn't resolve this Google Maps link. Please check the link and try again.",
      422,
    );
    expect(extractVendorFieldErrors(resolverError)).toBeNull();
  });

  it('extractVendorFieldErrors still extracts a real Zod fieldErrors map for an unrelated 422 (e.g. a bad businessEmail)', () => {
    const zodError = new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, {
      fieldErrors: { businessEmail: ['Enter a valid email address'] },
    });
    expect(extractVendorFieldErrors(zodError)).toEqual({ businessEmail: 'Enter a valid email address' });
  });
});

/** Item 8: Save is never silently disabled; a click names what to fix, and the address uses lists. */
describe('VendorProfileForm — clear save and address lists (item 8)', () => {
  const ALL: ('business' | 'owner' | 'address' | 'bank')[] = ['business', 'owner', 'address', 'bank'];
  const saveButton = () => Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Save changes')) as HTMLElement;
  // React sets label and disabled as properties on the registered md-outlined-select.
  type Select = HTMLElement & { value: string; label: string; disabled: boolean };
  const select = (label: string) =>
    (Array.from(document.querySelectorAll('md-outlined-select')) as Select[]).find((el) => el.label === label) as Select;
  // Same as branch-form-page.test.tsx: shadow the Lit value accessor so the change handler reads
  // the picked value under jsdom.
  // The own property is removed right after, so Lit's accessor is back before the next render.
  const pick = (label: string, value: string) => {
    const el = select(label);
    Object.defineProperty(el, 'value', { configurable: true, writable: true, enumerable: true, value });
    fireEvent.change(el);
    delete (el as Partial<Select>).value;
  };

  it('keeps Save enabled with an empty address and, on click, lists the missing fields instead of saving', async () => {
    const onSave = vi.fn();
    render(<VendorProfileForm vendor={BASE_VENDOR} canEdit saving={false} token="tok" sections={ALL} onSave={onSave} />);
    expect(saveButton().hasAttribute('disabled')).toBe(false);
    fireEvent.click(saveButton());
    const summary = await screen.findByRole('alert', { name: /Fix these fields to save/ });
    expect(summary.textContent).toContain('Address 1');
    expect(summary.textContent).toContain('State');
    expect(summary.textContent).toContain('City');
    expect(summary.textContent).toContain('PIN code');
    expect(summary.textContent).toContain('Map location');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('offers the India states, and the cities of the chosen state once one is picked', () => {
    render(<VendorProfileForm vendor={BASE_VENDOR} canEdit saving={false} token="tok" sections={['address']} onSave={vi.fn()} />);
    expect(select('City').disabled).toBe(true);
    const states = Array.from(select('State').querySelectorAll('md-select-option')).map((o) => o.textContent);
    expect(states).toContain('Delhi');
    pick('State', 'Delhi');
    expect(select('City').disabled).toBe(false);
    expect(Array.from(select('City').querySelectorAll('md-select-option')).map((o) => o.textContent)).toContain('New Delhi');
  });

  it('notes unsaved changes and Discard puts the saved values back', async () => {
    render(<VendorProfileForm vendor={BASE_VENDOR} canEdit saving={false} token="tok" sections={['address']} onSave={vi.fn()} />);
    expect(screen.queryByText('You have unsaved changes.')).toBeNull();
    pick('State', 'Delhi');
    expect(await screen.findByText('You have unsaved changes.')).toBeTruthy();
    const discard = Array.from(document.querySelectorAll('md-text-button')).find((el) => el.textContent?.includes('Discard')) as HTMLElement;
    fireEvent.click(discard);
    await waitFor(() => expect(screen.queryByText('You have unsaved changes.')).toBeNull());
    expect(select('City').disabled).toBe(true);
  });

  it('lays each section out as a titled region, not a bordered card', () => {
    render(<VendorProfileForm vendor={BASE_VENDOR} canEdit saving={false} token="tok" sections={ALL} onSave={vi.fn()} />);
    expect(document.querySelector('sky-tile-card')).toBeNull();
    for (const name of ['Business details', 'Owner', 'Registered address', 'Bank details']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
  });
});
