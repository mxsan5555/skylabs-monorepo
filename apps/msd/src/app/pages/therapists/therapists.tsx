import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { listCatalogTherapists, type CatalogTherapist } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { formatINR } from '../../../utils/format';
import { resolveTherapistMedia, primaryImage } from '../../../utils/media';
import { useCurrentLocation } from '../../../hooks/useCurrentLocation';
import '../category/category.css';

/** Lowest active package price, for the listing card's "From ₹X" line — null when this
 *  therapist has no priced packages yet (still browsable, just not bookable until one exists). */
function fromPrice(therapist: CatalogTherapist): number | null {
  if (therapist.packages.length === 0) return null;
  return Math.min(...therapist.packages.map((p) => Number(p.sellingPrice)));
}

/**
 * Therapist Listing — the customer entry point for browsing therapists directly, entirely
 * independent of Deal (never requires selecting a Deal first — see msd-api's Therapist schema
 * doc comment). Backed by `GET /catalog/therapists`. Reuses `category.css`'s hero/grid classes
 * for the page chrome and the same Showcase Card (`sky-product-card`, via `SkyProductCardWC`)
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
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load therapists.'))
      .finally(() => setLoading(false));
  }, [coords?.latitude, coords?.longitude]);

  return (
    <div className="category-page">
      <title>Therapists | MSD</title>
      <meta name="description" content="Browse therapists directly and book their own duration/price packages — no deal required." />

      <Breadcrumb className="category-page__breadcrumb" items={[{ label: 'Home', to: '/' }, { label: 'Therapists' }]} />

      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div className="category-page__hero-icon" aria-hidden="true">
            <Icon>spa</Icon>
          </div>
          <div>
            <h1 className="category-page__title">Therapists</h1>
            <p className="category-page__subtitle">Browse our therapists and book their own duration/price packages directly.</p>
          </div>
        </div>
      </header>

      <section className="category-page__grid-wrap" aria-label="Therapists">
        <div className="category-page__grid-inner">
          {loading ? (
            <p className="loading-state">Loading therapists…</p>
          ) : error ? (
            <p className="error-state" role="alert">{error}</p>
          ) : therapists.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card icon="spa" heading="No therapists yet" subheading="Check back soon." />
            </div>
          ) : (
            <ul className="category-page__grid">
              {therapists.map((t) => {
                const price = fromPrice(t);
                return (
                  <li key={t.id}>
                    <SkyProductCardWC
                      image={primaryImage(resolveTherapistMedia(t))}
                      eyebrow={t.personName}
                      eyebrowHref={t.vendor?.slug ? `/vendor/${t.vendor.slug}` : undefined}
                      heading={t.therapistType}
                      location={t.branch?.city ?? undefined}
                      distance={t.distanceKm != null ? `${(Math.round(t.distanceKm * 10) / 10)} km` : undefined}
                      tag={t.popularTags?.[0]?.name}
                      pricePrefix={price != null ? 'From' : undefined}
                      price={price != null ? formatINR(price) : undefined}
                      href={`/therapist/${t.id}`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default Therapists;
