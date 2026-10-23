import { useEffect, useState } from 'react';
import { listCatalogTherapists, type CatalogTherapist } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { Seo } from '../../seo/seo';
import { TherapistCard } from '../../components/therapist-card/therapist-card';
import { fillTemplate, formatINR } from '../../../utils/format';
import { resolveTherapistMedia } from '../../../utils/media';
import { useCurrentLocation } from '../../../hooks/useCurrentLocation';
import content from '../../../content.json';

const t = content.therapists;

/**
 * Therapist Listing — the customer entry point for browsing therapists directly, entirely
 * independent of Deal (never requires selecting a Deal first — see msd-api's Therapist schema
 * doc comment). Backed by `GET /catalog/therapists`. Composed from the storefront blocks
 * (PageSection, SectionHead, CardGrid) and the same Showcase Card (`sky-product-card`, via `SkyProductCardWC`)
 * Deal/Product listings already use — no separate, less-capable card component for Therapist.
 * `therapistType` is the card heading and `personName` the eyebrow — the two are always shown
 * separately, never merged into one field. `rating`/`reviews` are omitted (no rating system
 * exists yet for Therapist) rather than fabricated — the card already renders nothing for an
 * absent prop. `distance` IS real when available — the browser's own geolocation coordinates
 * (see `useCurrentLocation`), sent to the same existing `GET /catalog/therapists` endpoint, come
 * back as each therapist's own real Haversine `distanceKm` to its branch.
 */
export function Therapists() {
  const [therapists, setTherapists] = useState<CatalogTherapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { coords } = useCurrentLocation();

  useEffect(() => {
    setLoading(true);
    setError('');
    listCatalogTherapists({ pageSize: 60, latitude: coords?.latitude, longitude: coords?.longitude })
      .then(({ data }) => setTherapists(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : t.errors.load))
      .finally(() => setLoading(false));
  }, [coords?.latitude, coords?.longitude]);

  const fallback = loading ? (
    <p className="loading-state" role="status">{t.loading}</p>
  ) : error ? (
    <p className="error-state" role="alert">{error}</p>
  ) : therapists.length === 0 ? (
    <sky-info-card icon="spa" heading={t.empty.title} subheading={t.empty.description} />
  ) : undefined;

  return (
    <>
      <Seo title={t.metaTitle} description={t.metaDescription} path={t.path} />
      <PageSection stack aria-labelledby="therapists-heading">
        <Breadcrumb items={[{ label: t.breadcrumb.home, to: '/' }, { label: t.breadcrumb.therapists }]} />
        <SectionHead as="h1" id="therapists-heading" titleClassName="headline-large" heading={t.title} subheading={t.subtitle} />
      </PageSection>
      <PageSection tone="tint" aria-label={t.title}>
        <CardGrid fallback={fallback}>
          {therapists.map((therapist) => (
            <TherapistCard key={therapist.id} therapist={therapist} />
          ))}
        </CardGrid>
      </PageSection>
    </>
  );
}

export default Therapists;
