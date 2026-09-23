import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogDeal } from '../../../api/catalog';
import { formatINR } from '../../../utils/format';
import { toDealCardDeal } from './home-data';
import content from '../../../content.json';

const { home } = content;

/** Hero: the page's only h1, site search, and a live "top deal" spotlight over the photo. */
export function HomeHero({ spotlight }: { spotlight?: CatalogDeal }) {
  const navigate = useNavigate();
  const spotlightCard = spotlight ? toDealCardDeal(spotlight) : null;

  return (
    <section className="home-hero" aria-labelledby="hero-heading">
      <div className="home-container home-hero__inner">
        <div className="home-hero__copy">
          <h1 id="hero-heading" className="home-hero__title">{home.hero.heading}</h1>
          <p className="home-hero__sub">{home.hero.subheading}</p>
          <sky-action-field
            className="home-hero__search"
            role="search"
            type="search"
            enterkeyhint="search"
            icon="search"
            label={home.hero.searchLabel}
            placeholder={home.hero.searchPlaceholder}
            action-label={home.hero.ctaLabel}
            onsky-submit={(e) => {
              const q = e.detail.value;
              navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
            }}
          />
        </div>

        <div className="home-hero__visual">
          <img
            className="home-hero__img"
            src={home.hero.image}
            alt={home.hero.imageAlt}
            width={1400}
            height={1050}
            fetchPriority="high"
          />
          {spotlight && spotlightCard && (
            <Link to={`/deal/${spotlight.id}`} className="home-spotlight">
              {spotlightCard.image && (
                <img className="home-spotlight__thumb" src={spotlightCard.image} alt="" width={72} height={72} />
              )}
              <span className="home-spotlight__body">
                <span className="home-spotlight__label">{home.hero.spotlightLabel}</span>
                <span className="home-spotlight__title">{spotlightCard.title}</span>
                <span className="home-spotlight__price">
                  <strong>{formatINR(spotlightCard.price)}</strong>
                  {spotlightCard.originalPrice && <s>{formatINR(spotlightCard.originalPrice)}</s>}
                  {spotlightCard.discount ? (
                    <span className="home-spotlight__off">-{spotlightCard.discount}%</span>
                  ) : null}
                </span>
              </span>
              <Icon className="home-spotlight__arrow" aria-hidden="true">arrow_forward</Icon>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
