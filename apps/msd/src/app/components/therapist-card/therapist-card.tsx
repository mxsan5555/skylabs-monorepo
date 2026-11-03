import type { ReactNode } from 'react';
import type { CatalogTherapist } from '../../../api/catalog';
import { fillTemplate, formatINR } from '../../../utils/format';
import { resolveTherapistMedia } from '../../../utils/media';
import { therapistPath } from '../../seo/public-urls';
import { SkyProductCardWC } from '../sky-product-card-wc';
import content from '../../../content.json';

/** Lowest package price (the card's "From ₹X"), or null while there are no priced packages. */
export function lowestPackagePrice(packages: { sellingPrice: string | number }[]): number | null {
  return packages.length > 0 ? Math.min(...packages.map((p) => Number(p.sellingPrice))) : null;
}

/** Distance to one decimal in the storefront's unit, e.g. "6.4 km". */
export const formatDistance = (km: number) =>
  fillTemplate(content.offerCard.distance, { km: String(Math.round(km * 10) / 10) });

export interface TherapistCardProps {
  therapist: CatalogTherapist;
  layout?: 'vertical' | 'horizontal';
  variant?: 'plain' | 'outlined';
  /** Kind label on the image, for mixed result lists (search). */
  badge?: string;
  /** Actions (e.g. the packages dialog trigger). */
  children?: ReactNode;
}

/** Therapist listing card: image slider, member link, area, distance and the lowest package
 *  price. The whole card opens the therapist page. */
export function TherapistCard({ therapist, layout, variant, badge, children }: TherapistCardProps) {
  const price = lowestPackagePrice(therapist.packages);
  return (
    <SkyProductCardWC
      variant={variant}
      gallery={resolveTherapistMedia(therapist).images}
      imageAlt={therapist.personName}
      badge={badge}
      tag={therapist.popularTags?.[0]?.name}
      eyebrow={therapist.personName}
      eyebrowHref={therapist.vendor?.slug ? `/vendor/${therapist.vendor.slug}` : undefined}
      heading={therapist.therapistType}
      location={therapist.branch?.city ?? undefined}
      distance={therapist.distanceKm != null ? formatDistance(therapist.distanceKm) : undefined}
      pricePrefix={price != null ? content.therapistCard.from : undefined}
      price={price != null ? formatINR(price) : undefined}
      href={therapistPath(therapist)}
      layout={layout}
    >
      {children}
    </SkyProductCardWC>
  );
}
