import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '@skylabs-monorepo/shared-ui/carousel';
import {
  listCatalogPromotions,
  type CatalogPromotion,
} from '../../../api/catalog';
import { resolveMediaUrl } from '../../../api/media';
import { PageSection } from '../../components/page-section/page-section';
import content from '../../../content.json';

const { home } = content;

/**
 * Resolve the safe internal destination for a promotion.
 */
function promotionHref(promotion: CatalogPromotion): string {
  if (
    promotion.destinationType === 'CATEGORY' &&
    promotion.category
  ) {
    return `/category/${promotion.category.slug}`;
  }

  if (
    promotion.destinationType === 'DEAL' &&
    promotion.deal
  ) {
    return `/deal/${promotion.deal.id}`;
  }

  return promotion.destinationRoute ?? '/';
}

export function HomeOffers({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const [promotions, setPromotions] = useState<CatalogPromotion[] | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    listCatalogPromotions()
      .then(({ data }) => {
        if (!cancelled) {
          setPromotions(data ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromotions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (promotions === null) {
    return null;
  }

  if (promotions.length === 0 && isAuthenticated) {
    return null;
  }

  return (
    <PageSection aria-labelledby="offers-heading">
      <h2 id="offers-heading" className="sr-only">
        {home.sections.offers.heading}
      </h2>

      <div
        className={`home-offers${
          isAuthenticated ? ' home-offers--member' : ''
        }`}
      >
        {/* Main promotion */}
        {promotions[0] && (
          <article className="home-offer home-offer--welcome">
            {promotions[0].image && (
              <img
                className="home-offer__bg"
                src={resolveMediaUrl(promotions[0].image)}
                alt=""
                loading="lazy"
                decoding="async"
              />
            )}

            <div className="home-offer__content">
              <h3 className="home-offer__title">
                {promotions[0].title}
              </h3>

              {promotions[0].description && (
                <p className="home-offer__text">
                  {promotions[0].description}
                </p>
              )}

              <Link
                to={promotionHref(promotions[0])}
                className="home-offer__cta label-large"
              >
                {promotions[0].buttonLabel ?? 'Explore'}
              </Link>
            </div>
          </article>
        )}

        {/* Second promotion */}
        {promotions[1] && (
          <sky-feature-card
            className="home-offer--gift"
            color="secondary"
            icon="card_giftcard"
            icon-style="surface"
            headline={promotions[1].title}
            text={promotions[1].description ?? ''}
            cta-label={promotions[1].buttonLabel ?? 'Explore'}
            cta-href={promotionHref(promotions[1])}
          />
        )}

        {/* Member banner - only for signed-out users */}
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

export default HomeOffers;