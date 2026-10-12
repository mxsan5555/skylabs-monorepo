import type { Vendor } from '../../../../api/rbac/vendors';

export type SetupStepKey = 'profile' | 'branches' | 'deals' | 'therapists' | 'products';

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  /** Rows for profile/branches are done or not; deals/therapists/products are done once one exists. */
  done: boolean;
  locked: boolean;
  /** Plain-language reason shown next to a locked step. */
  lockedReason?: string;
  /** Plain-language list of what is still missing. Empty when done. */
  missing: string[];
  /** "5 of 18" or "18", ready to show. Omitted for the profile step. */
  count?: string;
}

/** "5 of 18" when some items are not live, "18" when all are, "0" when none exist. */
export function formatCount(live: number | undefined, total: number | undefined): string {
  const all = total ?? 0;
  if (live === undefined || live === all) return String(all);
  return `${live} of ${all}`;
}

const has = (value: unknown) => (typeof value === 'string' ? value.trim().length > 0 : value != null);

/** What is missing from the profile, in the same terms the server's `submitForVerification`
 *  checks (msd-api `vendor.service.ts`): business, owner, address with a resolved map location,
 *  and one KYC document. Bank details are optional there, so they are optional here. */
export function missingProfileParts(vendor: Vendor): string[] {
  const missing: string[] = [];
  if (!(has(vendor.businessName) && has(vendor.businessEmail) && has(vendor.businessPhone))) {
    missing.push('Business name, email and phone');
  }
  if (!(has(vendor.ownerFirstName) && has(vendor.ownerLastName) && has(vendor.ownerMobile) && has(vendor.ownerEmail))) {
    missing.push('Owner name, phone and email');
  }
  if (!(has(vendor.address) && has(vendor.city) && has(vendor.state) && has(vendor.pincode))) {
    missing.push('Full address');
  }
  if (vendor.latitude == null || vendor.longitude == null) {
    missing.push('Map location');
  }
  const hasDocument = (vendor.documents?.length ?? 0) > 0 || (vendor.kycDocuments?.length ?? 0) > 0;
  if (!hasDocument) {
    missing.push('One KYC document (GST, PAN or Aadhaar)');
  }
  return missing;
}

/** The ordered setup steps for one member. Unlock order: profile unlocks branches and
 *  products (any one of deals/therapists/products is enough to finish setup); branches then
 *  unlocks deals and therapists. A branch counts once it exists; the branch form (step 3 of
 *  the redesign) will require a state. */
export function getSetupSteps(vendor: Vendor): SetupStep[] {
  const total = vendor._count;
  const live = vendor.liveCounts;
  const profileMissing = missingProfileParts(vendor);
  const profileDone = profileMissing.length === 0;
  const branchTotal = total?.branches ?? 0;
  const branchDone = branchTotal > 0;

  const content = (
    key: 'deals' | 'therapists' | 'products',
    label: string,
    noun: string,
    locked: boolean,
    lockedReason: string,
  ): SetupStep => {
    const count = total?.[key] ?? 0;
    return {
      key,
      label,
      done: count > 0,
      locked,
      lockedReason: locked ? lockedReason : undefined,
      missing: count > 0 ? [] : [`No ${noun} yet`],
      count: formatCount(live?.[key], count),
    };
  };

  return [
    { key: 'profile', label: 'Profile', done: profileDone, locked: false, missing: profileMissing },
    {
      key: 'branches',
      label: 'Branches',
      done: branchDone,
      locked: !profileDone,
      lockedReason: !profileDone ? 'Finish the profile first' : undefined,
      missing: branchDone ? [] : ['No branch yet'],
      count: formatCount(live?.branches, branchTotal),
    },
    content('deals', 'Deals', 'deals', !branchDone, 'Add a branch first'),
    content('therapists', 'Therapists', 'therapists', !branchDone, 'Add a branch first'),
    // Products are managed at the vendor level, independent of any branch — only the
    // profile needs to be complete.
    content('products', 'Products', 'products', !profileDone, 'Finish the profile first'),
  ];
}

/** Ready to approve: profile and branch are done and at least one deal, therapist or product exists. */
export function isSetupComplete(steps: SetupStep[]): boolean {
  const done = (key: SetupStepKey) => steps.find((s) => s.key === key)?.done ?? false;
  return done('profile') && done('branches') && (done('deals') || done('therapists') || done('products'));
}

/** The one line under "Setup progress", context-aware so it always answers "what do I do next"
 *  instead of a generic instruction — in particular naming the profile card (on the right) as
 *  the way in when every card on the left is locked, since that connection isn't visually obvious. */
export function setupHint(steps: SetupStep[]): string {
  const done = (key: SetupStepKey) => steps.find((s) => s.key === key)?.done ?? false;
  if (!done('profile')) return 'Complete the profile on the right to unlock branches and products.';
  if (!done('branches')) return 'Add a branch below to unlock deals and therapists.';
  if (isSetupComplete(steps)) return 'Everything needed is in place.';
  return 'Add at least one deal, therapist or product to finish setup.';
}

export interface MissingPoint {
  key: SetupStepKey;
  /** The step's own label, used as the point's heading. */
  label: string;
  text: string;
}

const CONTENT_KEYS: SetupStepKey[] = ['deals', 'therapists', 'products'];

/** One flat list of everything still missing across every step, for the member's summary card.
 *
 *  A locked step's own reason is skipped — it is a consequence of an earlier missing point
 *  (finish the profile, then add a branch) that is already in this same list, not a second thing
 *  to fix. Profile can contribute more than one point; every other step contributes at most one.
 *
 *  Deals, therapists and products satisfy each other (`isSetupComplete` only needs one of the
 *  three), so once any one of them is done the other two stop being "missing" — they were never
 *  required, only offered. */
export function getMissingPoints(steps: SetupStep[]): MissingPoint[] {
  const contentDone = steps.some((s) => CONTENT_KEYS.includes(s.key) && s.done);
  return steps
    .filter((s) => !s.locked && !s.done && !(contentDone && CONTENT_KEYS.includes(s.key)))
    .flatMap((s) => s.missing.map((text) => ({ key: s.key, label: s.label, text })));
}
