import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui/carousel';
import { listCatalogPromotions, type CatalogPromotion } from '../../../api/catalog';
import { resolveMediaUrl } from '../../../api/media';
import { PageSection } from '../../components/page-section/page-section';
import content from '../../../content.json';

const { home } = content;

/** The safe internal path/route a Promotion's CTA resolves to — Category/Deal always resolve
 *  through the live row's own id/slug (never a stored, possibly-stale URL string); ROUTE is
 *  restricted server-side to a fixed allow-list (see msd-api's `promotion.schema.ts`). */
function promotionHref(promotion: CatalogPromotion): string {
  if (promotion.destinationType === 'CATEGORY' && promotion.category) return `/category/${promotion.category.slug}`;
  if (promotion.destinationType === 'DEAL' && promotion.deal) return `/deal/${promotion.deal.id}`;
  return promotion.destinationRoute ?? '/';
}

/**
 * Offers bento: Admin-managed promotion cards (`/account/masters/promotions`, replacing the
 * previous hardcoded `content.json` welcome-offer/gift-card claims) + member pricing banner
 * (signed-out only — a real structural product feature, not a marketing claim, so it stays as-is).
 * 0 active promotions omits the section entirely rather than rendering an empty/broken bento.
 * More promotions than the original 2-card bento naturally fits render through the same Swiper
 * carousel primitive `home-hero.tsx`'s slider and the shared-ui carousel showcase use — one card
 * style, swipeable, no layout break at any count.
 */
export function HomeOffers({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [promotions, setPromotions] = useState<CatalogPromotion[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCatalogPromotions()
      .then(({ data }) => {
        if (!cancelled) setPromotions(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setPromotions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (promotions === null) return null; // still loading — nothing to show yet, no layout flash
  if (promotions.length === 0 && isAuthenticated) return null; // no promotions and no member banner to show either

  return (
    <PageSection aria-labelledby="offers-heading">
      {/* A neutral, structural section heading (not a specific promotion's own marketing title —
          the section can render with 0 promotions, just the member banner) — visually hidden to
          preserve the original layout, which had no separate section-level heading either. */}
      <h2 id="offers-heading" className="sr-only">{home.sections.offers.heading}</h2>
      <div className={`home-offers${isAuthenticated ? ' home-offers--member' : ''}`}>
        {promotions.length > 0 && (
          <swiper-container
            className="home-offers__carousel"
            slides-per-view="auto"
            space-between="16"
            pagination={promotions.length > 1}
          >
            {promotions.map((promotion, index) => (
              <swiper-slide key={promotion.id} className="home-offers__slide">
                {index === 0 ? (
                  <article className="home-offer home-offer--welcome">
                    {promotion.image && (
                      <img className="home-offer__bg" src={resolveMediaUrl(promotion.image)} alt="" loading="lazy" decoding="async" />
                    )}
                    <div className="home-offer__content">
                      <p className="home-offer__title">{promotion.title}</p>
                      {promotion.description && <p className="home-offer__text">{promotion.description}</p>}
                      <Link to={promotionHref(promotion)} className="home-offer__cta label-large">
                        {promotion.buttonLabel ?? 'Explore'}
                      </Link>
                    </div>
                  </article>
                ) : (
                  <sky-feature-card
                    color="secondary"
                    icon="local_offer"
                    icon-style="surface"
                    headline={promotion.title}
                    text={promotion.description ?? ''}
                    cta-label={promotion.buttonLabel ?? 'Explore'}
                    cta-href={promotionHref(promotion)}
                  />
                )}
              </swiper-slide>
            ))}
          </swiper-container>
        )}

        {!isAuthenticated && (
          <sky-feature-card
            color="surface-high"
            icon={home.memberBanner.icon}
            icon-style="surface"
            headline={home.memberBanner.heading}
            text={home.memberBanner.body}
            cta-label={home.memberBanner.button}
            cta-href={home.memberBanner.buttonLink}
          />
        )}
      </div>
    </PageSection>
  );
}
