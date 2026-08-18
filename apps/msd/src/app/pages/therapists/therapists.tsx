import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { listCatalogTherapists, type CatalogTherapist } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
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
 * and `sky-category-card` (same pattern as `/categories`) so this reads as part of the same
 * storefront. `therapistType` is the card heading and `personName` the subheading — the two are
 * always shown separately, never merged into one field.
 */
export function Therapists() {
  const [therapists, setTherapists] = useState<CatalogTherapist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    listCatalogTherapists({ pageSize: 60 })
      .then(({ data }) => setTherapists(data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load therapists.'))
      .finally(() => setLoading(false));
  }, []);

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
                const details = [t.vendor?.businessName, price != null ? `From ${formatINR(price)}` : 'Contact for pricing']
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={t.id}>
                    <sky-category-card
                      image={t.photoUrl ?? undefined}
                      heading={t.therapistType}
                      subheading={`${t.personName} · ${details}`}
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
