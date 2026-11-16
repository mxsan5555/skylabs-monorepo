import { useEffect, useState } from 'react';
import { listCatalogBanners, type CatalogBanner } from '../../../api/catalog';
import { resolveMediaUrl } from '../../../api/media';
import { bannerColor, type BannerSlot as BannerSlotName } from '../../../api/rbac/promotions';
import { useVisitorLocation } from '../../../location/location-context';
import { PageSection } from '../page-section/page-section';

/** One CTA banner: background and button use M3 colour roles (D24), so contrast holds. */
export function CtaBannerCard({ banner }: { banner: CatalogBanner }) {
  return (
    <sky-cta-banner
      color={bannerColor(banner.backgroundRole) as 'primary'}
      cta-color={bannerColor(banner.buttonRole) as 'primary'}
      headline={banner.title}
      {...(banner.description ? { text: banner.description } : {})}
      {...(banner.buttonLabel ? { 'cta-label': banner.buttonLabel, 'cta-href': banner.href } : {})}
      {...(banner.image ? { image: resolveMediaUrl(banner.image) } : {})}
    />
  );
}

/**
 * A named place for CTA banners on a storefront page (docs/msd/PLANNING.md §6, D25): the
 * visitor's state's active banners for this slot, else the Global/Default ones, else nothing.
 * Client-only (banners depend on the visitor's location), so prerendered HTML has no banner and
 * hydration stays clean.
 */
export function BannerSlot({ slot }: { slot: BannerSlotName }) {
  const { status, state } = useVisitorLocation();
  const [banners, setBanners] = useState<CatalogBanner[]>([]);

  useEffect(() => {
    if (status === 'locating') return;
    let cancelled = false;
    listCatalogBanners(slot, state)
      .then(({ data }) => {
        if (!cancelled) setBanners(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setBanners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slot, status, state]);

  if (banners.length === 0) return null;
  return (
    <PageSection flush stack aria-label="Offers">
      {banners.map((banner) => (
        <CtaBannerCard key={banner.id} banner={banner} />
      ))}
    </PageSection>
  );
}
