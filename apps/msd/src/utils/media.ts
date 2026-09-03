import { resolveMediaUrl } from '../api/media';

interface ResolvableImage {
  storageKey: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

interface ResolvableVideo {
  storageKey: string;
}

export interface ResolvedMedia {
  images: string[];
  video: string | null;
}

/** Backend selects already order `mediaImages` primary-first/sortOrder-asc, but re-sort
 *  defensively here too — this is the one place every call site relies on for ordering. */
function orderedImageUrls(media: ResolvableImage[]): string[] {
  return [...media]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((img) => resolveMediaUrl(img.storageKey));
}

function videoUrl(video: ResolvableVideo | null | undefined): string | null {
  return video ? resolveMediaUrl(video.storageKey) : null;
}

/**
 * Resolves a Deal's display media — prefers the uploaded `mediaImages`/`mediaVideo` (the shared
 * media-upload system), falling back to the legacy `images` URL array (and the linked Product's
 * own legacy `image`) for rows that predate it (see `DealImage`'s schema doc comment in msd-api).
 * One function instead of every card/page re-deriving its own `?? [x.image]` chain.
 */
export function resolveDealMedia(deal: {
  mediaImages?: ResolvableImage[];
  mediaVideo?: ResolvableVideo | null;
  images?: string[] | null;
  product?: { image?: string | null; mediaImages?: ResolvableImage[]; mediaVideo?: ResolvableVideo | null } | null;
}): ResolvedMedia {
  if (deal.mediaImages && deal.mediaImages.length > 0) {
    return { images: orderedImageUrls(deal.mediaImages), video: videoUrl(deal.mediaVideo) };
  }
  if (deal.product?.mediaImages && deal.product.mediaImages.length > 0) {
    return { images: orderedImageUrls(deal.product.mediaImages), video: videoUrl(deal.product.mediaVideo ?? deal.mediaVideo) };
  }
  const legacy = deal.images?.length ? deal.images : [deal.product?.image].filter((u): u is string => !!u);
  return { images: legacy, video: null };
}

/** Resolves a Product's display media — same precedence rule as `resolveDealMedia`. */
export function resolveProductMedia(product: {
  mediaImages?: ResolvableImage[];
  mediaVideo?: ResolvableVideo | null;
  image?: string | null;
  gallery?: string[] | null;
}): ResolvedMedia {
  if (product.mediaImages && product.mediaImages.length > 0) {
    return { images: orderedImageUrls(product.mediaImages), video: videoUrl(product.mediaVideo) };
  }
  const legacy = product.gallery?.length ? product.gallery : product.image ? [product.image] : [];
  return { images: legacy, video: null };
}

/** Resolves a Therapist's display media — same precedence rule as `resolveDealMedia`. */
export function resolveTherapistMedia(therapist: {
  mediaImages?: ResolvableImage[];
  mediaVideo?: ResolvableVideo | null;
  photoUrl?: string | null;
}): ResolvedMedia {
  if (therapist.mediaImages && therapist.mediaImages.length > 0) {
    return { images: orderedImageUrls(therapist.mediaImages), video: videoUrl(therapist.mediaVideo) };
  }
  return { images: therapist.photoUrl ? [therapist.photoUrl] : [], video: null };
}

/** Resolves a Vendor's display media (profile image/video) — same precedence rule as
 *  `resolveDealMedia`, falling back to the legacy `logoUrl` field for rows that predate it. */
export function resolveVendorMedia(vendor: {
  mediaImages?: ResolvableImage[];
  mediaVideo?: ResolvableVideo | null;
  logoUrl?: string | null;
}): ResolvedMedia {
  if (vendor.mediaImages && vendor.mediaImages.length > 0) {
    return { images: orderedImageUrls(vendor.mediaImages), video: videoUrl(vendor.mediaVideo) };
  }
  return { images: vendor.logoUrl ? [vendor.logoUrl] : [], video: null };
}

/** Primary-image-only convenience for listing cards (`sky-product-card`/`sky-category-card`
 *  both take a single `image` prop) — the full `images[]` array is for detail-page galleries. */
export function primaryImage(media: ResolvedMedia): string | undefined {
  return media.images[0];
}
