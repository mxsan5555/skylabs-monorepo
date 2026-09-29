import { describe, it, expect } from 'vitest';
import type { Vendor } from '../../../../api/rbac/vendors';
import { formatCount, getMissingPoints, getSetupSteps, isSetupComplete, missingProfileParts, setupHint } from './vendor-setup';

const COMPLETE_PROFILE: Vendor = {
  id: 'v1',
  businessName: 'Spa One',
  slug: 'spa-one',
  businessEmail: 'a@b.co',
  businessPhone: '9876543210',
  ownerFirstName: 'Asha',
  ownerLastName: 'Rao',
  ownerMobile: '9876543210',
  ownerEmail: 'asha@b.co',
  address: '1 Main Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400001',
  latitude: 19.07,
  longitude: 72.87,
  documents: [{ id: 'd1' }] as unknown as Vendor['documents'],
  ownerUserId: 'u1',
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
  _count: { branches: 0, deals: 0, products: 0, therapists: 0 },
};

const withCounts = (counts: Partial<NonNullable<Vendor['_count']>>): Vendor => ({
  ...COMPLETE_PROFILE,
  _count: { branches: 0, deals: 0, products: 0, therapists: 0, ...counts },
});

const step = (vendor: Vendor, key: string) => {
  const found = getSetupSteps(vendor).find((s) => s.key === key);
  if (!found) throw new Error(`No setup step ${key}`);
  return found;
};

describe('formatCount', () => {
  it('shows live of total when they differ', () => expect(formatCount(5, 18)).toBe('5 of 18'));
  it('shows one number when all are live', () => expect(formatCount(18, 18)).toBe('18'));
  it('shows the total when live is unknown', () => expect(formatCount(undefined, 18)).toBe('18'));
  it('shows 0 when nothing is known', () => expect(formatCount(undefined, undefined)).toBe('0'));
});

describe('missingProfileParts', () => {
  it('is empty for a complete profile', () => expect(missingProfileParts(COMPLETE_PROFILE)).toEqual([]));

  it('names each missing part in plain words', () => {
    const missing = missingProfileParts({ ...COMPLETE_PROFILE, businessPhone: '', ownerEmail: undefined, latitude: null, documents: [] });
    expect(missing).toEqual(['Business name, email and phone', 'Owner name, phone and email', 'Map location', 'One KYC document (GST, PAN or Aadhaar)']);
  });

  it('accepts a legacy pasted KYC document when no file was uploaded', () => {
    const legacy = { ...COMPLETE_PROFILE, documents: [], kycDocuments: [{ type: 'GST', url: 'x' }] } as unknown as Vendor;
    expect(missingProfileParts(legacy)).toEqual([]);
  });

  it('does not require bank details', () => {
    expect(missingProfileParts({ ...COMPLETE_PROFILE, bankAccountNumber: undefined })).toEqual([]);
  });
});

describe('getSetupSteps locking', () => {
  it('locks branches until the profile is complete', () => {
    const incomplete = { ...COMPLETE_PROFILE, ownerMobile: '' };
    expect(step(incomplete, 'branches')).toMatchObject({ locked: true, lockedReason: 'Finish the profile first' });
  });

  it('opens branches once the profile is complete, and keeps deals/therapists/products locked', () => {
    const steps = getSetupSteps(COMPLETE_PROFILE);
    expect(steps.find((s) => s.key === 'branches')?.locked).toBe(false);
    for (const key of ['deals', 'therapists', 'products']) {
      expect(steps.find((s) => s.key === key)).toMatchObject({ locked: true, lockedReason: 'Add a branch first' });
    }
  });

  it('opens deals, therapists and products once a branch exists', () => {
    const steps = getSetupSteps(withCounts({ branches: 1 }));
    for (const key of ['deals', 'therapists', 'products']) {
      expect(steps.find((s) => s.key === key)?.locked).toBe(false);
    }
  });

  it('marks a content step done as soon as one item exists, and shows live of total', () => {
    const vendor: Vendor = { ...withCounts({ branches: 1, deals: 18 }), liveCounts: { branches: 1, deals: 5, products: 0, therapists: 0 } };
    expect(step(vendor, 'deals')).toMatchObject({ done: true, count: '5 of 18', missing: [] });
  });
});

describe('getMissingPoints', () => {
  it('is empty once profile, branches and one content step are all done', () => {
    expect(getMissingPoints(getSetupSteps(withCounts({ branches: 1, deals: 1 })))).toEqual([]);
  });

  it('lists every missing profile part, each tagged with the Profile label', () => {
    const vendor = { ...COMPLETE_PROFILE, ownerEmail: undefined, latitude: null };
    const points = getMissingPoints(getSetupSteps(vendor));
    expect(points).toEqual([
      { key: 'profile', label: 'Profile', text: 'Owner name, phone and email' },
      { key: 'profile', label: 'Profile', text: 'Map location' },
    ]);
  });

  it('does not repeat a locked step\'s reason once its cause is already listed', () => {
    // Profile incomplete -> branches/deals/therapists/products are all locked because of it,
    // not because of their own missing state, so only the one profile point should appear.
    const vendor = { ...COMPLETE_PROFILE, ownerEmail: undefined };
    expect(getMissingPoints(getSetupSteps(vendor))).toEqual([{ key: 'profile', label: 'Profile', text: 'Owner name, phone and email' }]);
  });

  it('lists an unlocked content step with nothing added yet', () => {
    const points = getMissingPoints(getSetupSteps(withCounts({ branches: 1 })));
    expect(points).toEqual([
      { key: 'deals', label: 'Deals', text: 'No deals yet' },
      { key: 'therapists', label: 'Therapists', text: 'No therapists yet' },
      { key: 'products', label: 'Products', text: 'No products yet' },
    ]);
  });
});

describe('setupHint', () => {
  it('points at the profile card when nothing is unlocked yet — the case a brand-new member lands on', () => {
    const vendor = { ...COMPLETE_PROFILE, ownerMobile: '' };
    expect(setupHint(getSetupSteps(vendor))).toBe('Complete the profile on the right to unlock branches, deals, therapists and products.');
  });

  it('asks for a branch once the profile is done', () => {
    expect(setupHint(getSetupSteps(COMPLETE_PROFILE))).toBe('Add a branch below to unlock deals, therapists and products.');
  });

  it('asks for one of deals/therapists/products once a branch exists', () => {
    expect(setupHint(getSetupSteps(withCounts({ branches: 1 })))).toBe('Add at least one deal, therapist or product to finish setup.');
  });

  it('says everything is in place once it is', () => {
    expect(setupHint(getSetupSteps(withCounts({ branches: 1, deals: 1 })))).toBe('Everything needed is in place.');
  });
});

describe('isSetupComplete', () => {
  it('is false with a profile and branch but nothing to sell', () => {
    expect(isSetupComplete(getSetupSteps(withCounts({ branches: 1 })))).toBe(false);
  });

  it('is true when any one of deals, therapists or products exists', () => {
    expect(isSetupComplete(getSetupSteps(withCounts({ branches: 1, therapists: 1 })))).toBe(true);
  });

  it('is false without a complete profile even if everything else exists', () => {
    const vendor = { ...withCounts({ branches: 2, deals: 3 }), businessName: null };
    expect(isSetupComplete(getSetupSteps(vendor))).toBe(false);
  });
});
