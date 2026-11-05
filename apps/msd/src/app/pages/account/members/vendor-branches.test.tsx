import { useRef } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SnackbarHost } from '../../../../snackbar/snackbar';
import type { Branch } from '../../../../api/rbac/vendors';
import { ApiRequestError } from '../../../../api/rbac/client';

// Deals are edited on the shared deal form now (deal-form-page.tsx, PLANNING §2.7), and branches
// carry no category mapping (D10: categories are open to every member), so this file covers the
// branch fields only.
import { BranchDialog } from './vendor-branches';

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
      <BranchDialog onSave={vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION)} {...props} />
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

  it('saving with Map Location left exactly as loaded submits the branch details only (no category step, D10)', async () => {
    const onSave = vi.fn().mockResolvedValue(BRANCH_WITH_LOCATION);
    renderBranchDialog({ branch: BRANCH_WITH_LOCATION, onSave });

    // Only the opening-hours day toggles are checkboxes now; no category tree.
    expect(screen.getAllByRole('checkbox').every((c) => /is open$/.test(c.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(screen.queryByText('Categories & Subcategories')).toBeNull();
    fireEvent.click(findSaveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].mapLocationUrl).toBe(BRANCH_WITH_LOCATION.mapLocationUrl);
    await waitFor(() => expect(screen.getByText('Branch updated successfully.')).toBeTruthy());
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

describe('BranchDialog — external trigger', () => {
  it('two triggers (external dialogRef, hideTrigger) can open the same BranchDialog instance', () => {
    function Harness() {
      const dialogRef = useRef<MdDialog>(null);
      return (
        <>
          <BranchDialog
            branch={BRANCH_WITH_LOCATION}
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
