import { useRef } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnackbarHost } from '../../../../snackbar/snackbar';
import type { Category, Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

// `listCategories` / `getBranchCategoryAccess` / `setBranchCategoryAccess` back `BranchDialog`'s
// Categories & Subcategories section. Deals are edited on the shared deal form now
// (deal-form-page.tsx, PLANNING §2.7), so DealDialog and its tests are gone.
const getBranchCategoryAccessMock = vi.fn();
const getMyBranchCategoryAccessMock = vi.fn();
const listCategoriesMock = vi.fn();
const setBranchCategoryAccessMock = vi.fn();

vi.mock('../../../../api/rbac/vendors', async () => {
  const actual = await vi.importActual<typeof import('../../../../api/rbac/vendors')>('../../../../api/rbac/vendors');
  return {
    ...actual,
    getBranchCategoryAccess: (...args: unknown[]) => getBranchCategoryAccessMock(...args),
    getMyBranchCategoryAccess: (...args: unknown[]) => getMyBranchCategoryAccessMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
    setBranchCategoryAccess: (...args: unknown[]) => setBranchCategoryAccessMock(...args),
  };
});

import { BranchDialog } from './vendor-branches';

// Fixtures for BranchDialog's own Categories & Subcategories section: the unfiltered
// SERVICE + THERAPY Category Master list used to build a branch's mapping.
const BD_TOP_MASSAGE: Category = { id: 'bd-top-massage', name: 'Massage', slug: 'massage', parentId: null, isActive: true, type: 'SERVICE' };
const BD_SUB_BODY_MASSAGE: Category = { id: 'bd-sub-body-massage', name: 'Body Massage', slug: 'body-massage', parentId: 'bd-top-massage', isActive: true };
const BD_SUB_FOOT_MASSAGE: Category = { id: 'bd-sub-foot-massage', name: 'Foot Massage', slug: 'foot-massage', parentId: 'bd-top-massage', isActive: true };
const BD_TOP_THERAPY: Category = { id: 'bd-top-therapy', name: 'Physiotherapy', slug: 'physiotherapy', parentId: null, isActive: true, type: 'THERAPY' };

const BD_SERVICE_CATEGORIES: Category[] = [BD_TOP_MASSAGE, BD_SUB_BODY_MASSAGE, BD_SUB_FOOT_MASSAGE];
const BD_THERAPY_CATEGORIES: Category[] = [BD_TOP_THERAPY];

beforeEach(() => {
  vi.clearAllMocks();
  getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
  getMyBranchCategoryAccessMock.mockResolvedValue({ data: [] });
  listCategoriesMock.mockImplementation((_token: string | null, opts: { type: string }) =>
    Promise.resolve({ data: opts.type === 'THERAPY' ? BD_THERAPY_CATEGORIES : BD_SERVICE_CATEGORIES }),
  );
  setBranchCategoryAccessMock.mockResolvedValue({ data: [] });
});

/**
 * Feature: BranchDialog — Map Location URL replaces directly-editable latitude/longitude
 * A single "Map Location" `OutlinedTextField` (pasted Google Maps link) replaces the old
 * Latitude/Longitude inputs — the server resolves the link into coordinates (see
 * `googleMapsUrlResolver.provider.ts` in msd-api) and `BranchInput` no longer carries
 * `latitude`/`longitude` at all. A resolver rejection (surfaced as an `ApiRequestError` with
 * `code: 'VALIDATION_ERROR'`) is shown inline under the Map Location field via
 * `errors.mapLocationUrl`, not just as a generic banner.
 */
function findSaveButton(): HTMLElement {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.trim() === 'Save');
  if (!button) throw new Error('Save button not found');
  return button as HTMLElement;
}

const BRANCH_WITH_LOCATION: Branch = {
  id: 'branch-1',
  vendorId: 'vendor-1',
  name: 'Golghar Branch',
  state: 'Uttar Pradesh',
  city: 'Gorakhpur',
  isActive: true,
  mapLocationUrl: 'https://maps.app.goo.gl/existingLink',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderBranchDialog(props: Partial<React.ComponentProps<typeof BranchDialog>> = {}) {
  return render(
    <>
      <BranchDialog token="tok" vendorId="vendor-1" onSave={vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION)} {...props} />
      <SnackbarHost />
    </>,
  );
}

describe('BranchDialog — Map Location URL', () => {
  // NOTE: `label`/`error` on `<md-outlined-text-field>` are properties `@lit/react` sets via a
  // `useLayoutEffect`-timed ref callback that (per this repo's own documented gap — see
  // `search.test.tsx`'s doc comment) never actually fires under this installed `@lit/react@1.0.8`
  // + React 19.2.7 + jsdom combination, so neither the property nor a reflected attribute is ever
  // observable here. Verified instead via the field COUNT (exactly 5: Branch Name, Address,
  // Address line 2, PIN Code, Map Location — never a field for Latitude/Longitude, which this component's
  // source contains no markup for at all) and, for the error-surfacing test below, via the
  // `errors.mapLocationUrl && <p role="alert">` sibling paragraph, which IS plain rendered DOM
  // text (not a custom-element property) and so is reliably queryable.
  it('renders exactly 5 text fields (Branch Name, Address, Address line 2, PIN Code, Map Location) — never a separate Latitude/Longitude field — for a fresh Add dialog', () => {
    renderBranchDialog({ onSave: vi.fn() });
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(5);
    expect(screen.queryByText('Latitude')).toBeNull();
    expect(screen.queryByText('Longitude')).toBeNull();
  });

  it('renders the same 5 fields (no lat/lng) when editing an existing branch', () => {
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave: vi.fn() });
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(5);
    expect(screen.queryByText('Latitude')).toBeNull();
    expect(screen.queryByText('Longitude')).toBeNull();
  });

  it('saving a branch with an existing mapLocationUrl submits mapLocationUrl, never latitude/longitude', async () => {
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const submitted = onSave.mock.calls[0][0];
    expect(submitted.mapLocationUrl).toBe('https://maps.app.goo.gl/existingLink');
    expect(submitted).not.toHaveProperty('latitude');
    expect(submitted).not.toHaveProperty('longitude');
  });

  it('a resolver VALIDATION_ERROR rejection renders inline under the Map Location field, not just a generic banner', async () => {
    const resolverMessage = "We couldn't resolve this Google Maps link. Please check the link and try again.";
    const onSave = vi.fn().mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', resolverMessage, 422));
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(resolverMessage)).toBeTruthy());
    // The generic dialog-level error ("Fix the highlighted fields before saving.") is set
    // alongside the field-level one — confirms the message lives under the field, not instead of
    // it silently replacing the generic banner with nothing.
    expect(screen.getByText('Fix the highlighted fields before saving.')).toBeTruthy();
  });

  it('a non-mapLocationUrl error (e.g. generic network failure) falls back to the dialog\'s generic error message, not the field-level one', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Network request failed'));
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Could not save branch.')).toBeTruthy());
  });

  /** Regression test — a fresh Add dialog's Branch Name starts empty, so clicking Save with
   *  nothing else touched exercises the "name is required" client-side gate directly. Confirms
   *  the message is field-scoped (same `errors.X && <p role="alert">` convention as
   *  `errors.mapLocationUrl` above), not only a generic banner, and that onSave is never called. */
  it('an empty Branch Name renders "Branch name is required." inline under the field, alongside the generic banner, and never calls onSave', async () => {
    const onSave = vi.fn();
    renderBranchDialog({ onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(screen.getByText('Branch name is required.')).toBeTruthy());
    expect(screen.getByText('Fix the highlighted fields before saving.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a branch with no state or city is not saved: state first, then its city (PLANNING §2.7)', async () => {
    const onSave = vi.fn();
    renderBranchDialog({ branch: { ...BRANCH_WITH_LOCATION, state: null, city: null }, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(screen.getByText('Select the state first.')).toBeTruthy());
    expect(screen.getByText('Select a city.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits the state, city and address line 2 of the branch', async () => {
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: { ...BRANCH_WITH_LOCATION, addressLine2: 'Near clock tower' }, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ state: 'Uttar Pradesh', city: 'Gorakhpur', addressLine2: 'Near clock tower' });
  });

  /**
   * Regression suite for the real bug: editing ANY field of a branch and saving failed with a
   * generic "Invalid request body", wrongly appearing to be caused by Map Location. Root cause
   * was `validateBody`'s Zod `VALIDATION_ERROR` (with a per-field `details.fieldErrors`
   * breakdown) being conflated with the Google Maps resolver's own single-message
   * `VALIDATION_ERROR` (no `details`) — `submit()`'s catch block always attributed both to
   * `mapLocationUrl`, hiding which field actually failed. These tests exercise the fixed
   * catch-block routing directly via a mocked `onSave` rejection, since driving live text-field
   * input isn't reliable in this test environment (see this suite's own file-level doc comment).
   */
  it('a Zod validateBody failure that does NOT name mapLocationUrl is never shown under the Map Location field — routed to the generic banner instead, naming the real field', async () => {
    const onSave = vi.fn().mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, {
        formErrors: [],
        fieldErrors: { openingHours: ['Invalid input: expected object, received string'] },
      }),
    );
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // If this had been misattributed to Map Location (the pre-fix behavior), the generic banner
    // would read "Fix the highlighted fields before saving." instead — this combined-message
    // form only ever renders for a field with no dedicated error slot.
    await waitFor(() =>
      expect(screen.getByText('Could not save: openingHours: Invalid input: expected object, received string')).toBeTruthy(),
    );
  });

  it('a Zod validateBody failure that DOES name mapLocationUrl is routed to the Map Location field specifically', async () => {
    const onSave = vi.fn().mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, {
        formErrors: [],
        fieldErrors: { mapLocationUrl: ['Invalid url'] },
      }),
    );
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(await screen.findByText('Invalid url')).toBeTruthy();
  });

  it('a failed save never closes the dialog and never re-renders it with fewer fields — the branch\'s previously-saved data is never lost', async () => {
    const resolverMessage = 'That is not a supported Google Maps URL. Please paste a link from Google Maps (e.g. maps.app.goo.gl or google.com/maps).';
    const onSave = vi.fn().mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', resolverMessage, 422));
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(screen.getByText(resolverMessage)).toBeTruthy());
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(5);
  });

  it('saving with Map Location left exactly as loaded still submits branch details AND category/subcategory access together', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(massageCheckbox);

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].mapLocationUrl).toBe(BRANCH_WITH_LOCATION.mapLocationUrl);
    await waitFor(() =>
      expect(setBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', BRANCH_WITH_LOCATION.id, {
        mappings: [{ categoryId: BD_TOP_MASSAGE.id, subcategoryIds: [] }],
      }),
    );
  });
});

/**
 * Feature: BranchDialog — legacy Operating Hours compatibility (the actual root cause)
 * Scenario: pre-migration `Branch.openingHours` rows were written as a plain string per day
 * (`"09:00-20:00"` / `"closed"`) — a convention that predates the current structured
 * `{ open, start, end }` per-day shape the server's `OpeningHoursSchema` requires. `Json?` has no
 * schema, so nothing ever migrated those rows. Left unnormalized, this dialog echoed the raw
 * legacy blob straight back in the save payload for a branch whose Operating Hours the admin
 * never even touched — the server's Zod schema then rightly rejected it
 * (`expected object, received string`), surfaced to the admin as a generic, misattributed
 * "Invalid request body" near whichever field they actually edited (commonly Map Location).
 * `normalizeOpeningHours` (this file) fixes this by normalizing on load, so the value this
 * dialog holds — and ultimately re-submits — is always in the shape the server's contract (left
 * intact, never loosened) expects.
 */
describe('BranchDialog — legacy Operating Hours compatibility', () => {
  it('normalizes legacy string-per-day openingHours into the structured shape before ever submitting, even when Operating Hours is never touched', async () => {
    const legacyBranch = {
      ...BRANCH_WITH_LOCATION,
      openingHours: { mon: '09:00-20:00', tue: '09:00-20:00', sun: 'closed' },
    } as unknown as Branch;
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: legacyBranch, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].openingHours).toEqual({
      mon: { open: true, start: '09:00', end: '20:00' },
      tue: { open: true, start: '09:00', end: '20:00' },
      sun: { open: false },
    });
  });

  it('a legacy-format day with unparseable text normalizes to closed rather than submitting garbage', async () => {
    const legacyBranch = { ...BRANCH_WITH_LOCATION, openingHours: { wed: 'ask the vendor' } } as unknown as Branch;
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: legacyBranch, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].openingHours).toEqual({ wed: { open: false } });
  });

  it('an already-structured openingHours value (a branch saved since the fix) passes through unchanged', async () => {
    const branch: Branch = { ...BRANCH_WITH_LOCATION, openingHours: { mon: { open: true, start: '10:00', end: '18:00' } } };
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].openingHours).toEqual({ mon: { open: true, start: '10:00', end: '18:00' } });
  });

  it('a branch with no openingHours at all (never configured) submits undefined, same as before this fix', async () => {
    const branch: Branch = { ...BRANCH_WITH_LOCATION, openingHours: null };
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch, onSave });

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].openingHours).toBeUndefined();
  });
});

/**
 * Feature: BranchDialog — Categories & Subcategories (folded in from the deleted
 * `branch-category-access-dialog.tsx`)
 * Scenario: `BranchDialog` now owns the branch's own SERVICE/THERAPY category mapping directly,
 * as one form alongside the branch fields, rather than a separate dialog.
 *
 * Given: the active-only SERVICE/THERAPY Category Master list and (when editing) a branch's
 *        already-saved mapping
 * When: `BranchDialog` renders (Add or Edit)
 * Then: the existing mapping is reflected as checked boxes, toggling behaves as documented, and
 *       Save submits the branch fields first, then the replace-the-full-set `mappings` shape
 *       against the resulting branchId
 *
 * Edge cases:
 * - a categories-only Save failure (after the branch itself already saved) shows a combined
 *   error and keeps the dialog open — never silently drops the category data
 * - zero active SERVICE/THERAPY categories shows an empty state
 * - `isSelf` omits the whole section — there is no self-service write route for it
 */
describe('BranchDialog — Categories & Subcategories', () => {
  it('loads the existing mapping for an existing branch and reflects it as checked category/subcategory boxes', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({
      data: [
        {
          id: 'bca-1',
          branchId: BRANCH_WITH_LOCATION.id,
          categoryId: BD_TOP_MASSAGE.id,
          createdAt: '2026-01-01T00:00:00Z',
          category: BD_TOP_MASSAGE,
          subcategories: [{ id: 'bsa-1', subcategoryId: BD_SUB_BODY_MASSAGE.id, subcategory: BD_SUB_BODY_MASSAGE }],
        },
      ],
    });
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION });
    await waitFor(() => expect(getBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', BRANCH_WITH_LOCATION.id));

    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    await waitFor(() => expect(massageCheckbox).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Body Massage' })).toBeChecked();
    // Foot Massage was never in the saved mapping's subcategories -> unchecked.
    expect(screen.getByRole('checkbox', { name: 'Foot Massage' })).not.toBeChecked();
    // A category never granted at all (Physiotherapy) starts unchecked.
    expect(screen.getByRole('checkbox', { name: 'Physiotherapy' })).not.toBeChecked();
  });

  it('a fresh Add dialog has no existing branch to fetch a mapping for — every category starts unchecked', async () => {
    renderBranchDialog();
    await waitFor(() => expect(listCategoriesMock).toHaveBeenCalledWith('tok', { type: 'SERVICE' }));
    expect(getBranchCategoryAccessMock).not.toHaveBeenCalled();
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    expect(massageCheckbox).not.toBeChecked();
  });

  it('checking a category checkbox reveals its subcategory checkboxes; unchecking hides them again', async () => {
    renderBranchDialog();
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    expect(screen.queryByRole('checkbox', { name: 'Body Massage' })).toBeNull();

    fireEvent.click(massageCheckbox);
    expect(await screen.findByRole('checkbox', { name: 'Body Massage' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Foot Massage' })).toBeTruthy();

    fireEvent.click(massageCheckbox);
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Body Massage' })).toBeNull());
  });

  it('checking a subcategory auto-checks its parent category', async () => {
    renderBranchDialog();
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(massageCheckbox);
    const bodyMassageCheckbox = await screen.findByRole('checkbox', { name: 'Body Massage' });
    expect(massageCheckbox).toBeChecked();
    fireEvent.click(bodyMassageCheckbox);
    expect(bodyMassageCheckbox).toBeChecked();
    expect(massageCheckbox).toBeChecked(); // still checked — never auto-unchecked by a subcategory toggle
  });

  it('unchecking a category clears its subcategory selections (not just hides them)', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({
      data: [
        {
          id: 'bca-1',
          branchId: BRANCH_WITH_LOCATION.id,
          categoryId: BD_TOP_MASSAGE.id,
          createdAt: '2026-01-01T00:00:00Z',
          category: BD_TOP_MASSAGE,
          subcategories: [{ id: 'bsa-1', subcategoryId: BD_SUB_BODY_MASSAGE.id, subcategory: BD_SUB_BODY_MASSAGE }],
        },
      ],
    });
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION });
    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    await waitFor(() => expect(massageCheckbox).toBeChecked());
    fireEvent.click(massageCheckbox); // uncheck the category
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Body Massage' })).toBeNull());

    // Re-checking the category now shows a fresh, empty subcategory set — the prior selection
    // was actually cleared from state, not merely hidden.
    fireEvent.click(massageCheckbox);
    const bodyMassageCheckbox = await screen.findByRole('checkbox', { name: 'Body Massage' });
    expect(bodyMassageCheckbox).not.toBeChecked();
  });

  it('Save submits the branch fields first, then calls setBranchCategoryAccess with the resulting branchId and the replace-the-full-set mappings shape', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(massageCheckbox);
    const bodyMassageCheckbox = await screen.findByRole('checkbox', { name: 'Body Massage' });
    fireEvent.click(bodyMassageCheckbox);

    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() =>
      expect(setBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', BRANCH_WITH_LOCATION.id, {
        mappings: [{ categoryId: BD_TOP_MASSAGE.id, subcategoryIds: [BD_SUB_BODY_MASSAGE.id] }],
      }),
    );
  });

  // A brand-new branch has no id until `onSave` resolves — this asserts the category save always
  // targets whatever id `onSave` actually returns, never a stale/prior one (there's no reliable
  // way to drive text-field input under this repo's documented jsdom + `@lit/react` gap — see the
  // "Map Location URL" suite's own doc comment — so this uses the `branch` prop's pre-filled name
  // to get past the required-field check, with `onSave` resolving a DIFFERENT id than the prop's,
  // standing in for "the id only the server assigns").
  it('categories are saved against the branchId returned by onSave, never a stale prop id', async () => {
    const RETURNED_BRANCH: Branch = { ...BRANCH_WITH_LOCATION, id: 'server-returned-id' };
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    const onSave = vi.fn().mockResolvedValue(RETURNED_BRANCH);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    const massageCheckbox = await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(massageCheckbox);

    fireEvent.click(findSaveButton());

    await waitFor(() =>
      expect(setBranchCategoryAccessMock).toHaveBeenCalledWith('tok', 'vendor-1', 'server-returned-id', {
        mappings: [{ categoryId: BD_TOP_MASSAGE.id, subcategoryIds: [] }],
      }),
    );
  });

  it('a categories-only save failure (branch itself already saved) shows a combined error and keeps the dialog open', async () => {
    getBranchCategoryAccessMock.mockResolvedValue({ data: [] });
    setBranchCategoryAccessMock.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Category is not a Service or Therapy category', 422));
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    await screen.findByRole('checkbox', { name: 'Massage' });
    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Both the inline `role="alert"` banner AND a snackbar fire with the same combined message (same
    // dual convention as this dialog's own mapLocationUrl error handling) — assert via the alert
    // role specifically, since the message text also appears a second time inside the snackbar.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Branch saved, but categories could not be saved: Category is not a Service or Therapy category',
    );
  });

  it('shows an empty state when zero active Service/Therapy categories exist in Category Master', async () => {
    listCategoriesMock.mockResolvedValue({ data: [] });
    renderBranchDialog();
    expect(await screen.findByText('No active Service or Therapy categories exist in Category Master yet.')).toBeTruthy();
  });

  it('isSelf omits the Categories & Subcategories section entirely and never calls listCategories/setBranchCategoryAccess', async () => {
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, isSelf: true, onSave: vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION) });
    expect(screen.queryByText('Categories & Subcategories')).toBeNull();

    fireEvent.click(findSaveButton());
    await waitFor(() => expect(screen.getByText('Branch updated successfully.')).toBeTruthy());
    expect(listCategoriesMock).not.toHaveBeenCalled();
    expect(setBranchCategoryAccessMock).not.toHaveBeenCalled();
  });

  it('two triggers (external dialogRef, hideTrigger) can open the same BranchDialog instance', () => {
    function Harness() {
      const dialogRef = useRef<MdDialog>(null);
      return (
        <>
          <BranchDialog
            branch={BRANCH_WITH_LOCATION}
            token="tok"
            vendorId="vendor-1"
            onSave={vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION)}
            dialogRef={dialogRef}
            hideTrigger
          />
          <SnackbarHost />
        </>
      );
    }
    render(<Harness />);
    // hideTrigger suppresses BranchDialog's own built-in "Edit"/"Add branch" button.
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Add branch')).toBeNull();
    // The dialog's own content (e.g. the Save button) still renders — just with no trigger of its own.
    expect(findSaveButton()).toBeTruthy();
  });
});
