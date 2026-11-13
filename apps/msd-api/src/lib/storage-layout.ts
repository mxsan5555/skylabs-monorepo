import { slugify } from './slug';

/**
 * Where every uploaded file lives (docs/msd/ARCHITECTURE.md §12.3). One folder per owner, so a
 * member's or customer's files can be listed, exported or removed together. Every folder is in
 * the public bucket except `memberDocuments`, which is in the private bucket and is only ever
 * opened through a short-lived signed link. Local development uses the same layout in its own
 * dev buckets. File names inside a folder are random UUIDs (lib/media-storage.ts).
 */
export const storageFolder = {
  memberProfile: (memberId: string) => `members/${memberId}/profile`,
  memberDeal: (memberId: string, dealId: string) => `members/${memberId}/deals/${dealId}`,
  memberTherapist: (memberId: string, therapistId: string) => `members/${memberId}/therapists/${therapistId}`,
  memberProduct: (memberId: string, productId: string) => `members/${memberId}/products/${productId}`,
  /** Private bucket only. */
  memberDocuments: (memberId: string) => `members/${memberId}/documents`,
  customerProfile: (customerId: string) => `customers/${customerId}/profile`,
  /** `state: null` is the Global/Default slider. */
  homeSlider: (state: string | null, slideId: string) => `home-slider/${state ? slugify(state) : 'global'}/${slideId}`,
  ctaBanner: (promotionId: string) => `cta-banners/${promotionId}`,
  staticContent: (section: 'blog' | 'about-us' | 'pages', id: string) => `static-content/${section}/${id}`,
  master: (section: 'categories', id: string) => `masters/${section}/${id}`,
};

/** Which bucket holds a stored key: member documents are private, everything else public.
 *  Documents uploaded before the private bucket (`vendor-documents/...`) stay public until the
 *  P5-04 move script runs. */
export function bucketForKey(storageKey: string): 'public' | 'private' {
  return /^members\/[^/]+\/documents\//.test(storageKey) ? 'private' : 'public';
}
