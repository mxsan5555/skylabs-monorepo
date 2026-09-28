import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import type { CatalogDeal } from '../../../api/catalog';
import { getCatalogHomeHero } from '../../../api/catalog';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useVisitorLocation } from '../../../location/location-context';
import { formatINR } from '../../../utils/format';
import { imageSrcSet, toDealCardDeal } from './home-data';
import { PageSection } from '../../components/page-section/page-section';
import content from '../../../content.json';
import type { DealCardDeal } from '../../components/deal-card';

const { home } = content;
const heroSrcSet = imageSrcSet(home.hero.image, [640, 960, 1400]);

/** Same card markup as the single-spotlight fallback below — used for every slide of the
 *  Admin-managed Home Hero slider AND the fallback spotlight, so there is exactly one visual
 *  style regardless of which data source is active (no redesign). Fixes the broken-thumbnail
 *  bug: `spotlightCard.image` had no failure handling before — a 404/broken URL rendered a
 *  visibly broken image icon. Now it swaps to a neutral placeholder frame on error. */
function SpotlightCard({ dealId, card }: { dealId: string; card: DealCardDeal }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(card.image) && !imgFailed;
  return (
    <Link to={`/deal/${dealId}`} className="home-spotlight">
      {showImage ? (
        <img
          className="home-spotlight__thumb"
          src={card.image}
          alt=""
          width={64}
          height={64}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="home-spotlight__thumb home-spotlight__thumb--placeholder" aria-hidden="true">
          <Icon>image</Icon>
        </span>
      )}
      <span className="home-spotlight__body">
        <span className="home-spotlight__label">{home.hero.spotlightLabel}</span>
        <span className="home-spotlight__title">{card.title}</span>
        <span className="home-spotlight__price">
          <strong>{formatINR(card.price)}</strong>
          {card.originalPrice && (
            <>
              <span className="sr-only">{home.hero.spotlightWas}</span>
              <s>{formatINR(card.originalPrice)}</s>
            </>
          )}
          {card.discount ? (
            <span className="home-spotlight__off">
              -{card.discount}%<span className="sr-only"> {home.hero.spotlightOff}</span>
            </span>
          ) : null}
        </span>
      </span>
      <Icon className="home-spotlight__arrow" aria-hidden="true">arrow_forward</Icon>
    </Link>
  );
}

/**
 * Hero: the page's only h1, site search, and a live Deal spotlight over the photo — headline,
 * subheading, search bar, and background image are untouched (no redesign).
 *
 * The spotlight overlay is Admin-managed via `/account/masters/home-hero`: a location-aware
 * slider of the visitor's State's configured Deals (falling back to the Global/Default slider
 * when the State has no publishable slider of its own, or geolocation is denied/unavailable —
 * both handled server-side by `GET /catalog/home-hero`, see `home-hero.service.ts`'s own doc
 * comment). If the Home Hero module has no publishable slider configured at all yet (a fresh
 * install, or an admin still building one out), this falls back to the pre-existing single
 * highest-discount-deal `spotlight` prop — the exact behavior this page always had — so nothing
 * regresses and the hero is never empty just because the new module isn't configured yet.
 */
export function HomeHero({ spotlight }: { spotlight?: CatalogDeal }) {
  const navigate = useNavigate();
  const fieldRef = useRef<HTMLElement>(null);
  const { status: locationStatus, state: locationState } = useVisitorLocation();
  const [heroSlides, setHeroSlides] = useState<CatalogDeal[] | null>(null);

  useEffect(() => {
    if (locationStatus === 'locating') return;
    let cancelled = false;
    getCatalogHomeHero(locationState ?? undefined)
      .then(({ data }) => {
        if (!cancelled) setHeroSlides((data?.slides ?? []).map((s) => s.deal));
      })
      .catch(() => {
        if (!cancelled) setHeroSlides([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locationStatus, locationState]);

  useCustomEvent<{ value: string }>(fieldRef, 'sky-submit', (e) => {
    const q = e.detail.value;
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  });

  const usingAdminSlider = Boolean(heroSlides && heroSlides.length > 0);
  const fallbackCard = spotlight ? toDealCardDeal(spotlight) : null;

  return (
    <PageSection className="home-hero" aria-labelledby="hero-heading">
      <div className="home-hero__inner">
        <div className="home-hero__copy">
          <h1 id="hero-heading" className="home-hero__title">{home.hero.heading}</h1>
          <p className="home-hero__sub">{home.hero.subheading}</p>
          <sky-action-field
            ref={fieldRef}
            className="home-hero__search"
            role="search"
            type="search"
            enterkeyhint="search"
            icon="search"
            label={home.hero.searchLabel}
            placeholder={home.hero.searchPlaceholder}
            action-label={home.hero.ctaLabel}
          />
        </div>

        <div className="home-hero__visual">
          <img
            className="home-hero__img"
            src={home.hero.image}
            srcSet={heroSrcSet}
            sizes="(min-width: 840px) 52vw, 100vw"
            alt={home.hero.imageAlt}
            width={1400}
            height={1050}
            fetchPriority="high"
          />
          {usingAdminSlider && heroSlides && (
            <swiper-container
              className="home-spotlight__carousel"
              slides-per-view="1"
              loop={heroSlides.length > 1}
              autoplay-delay="5000"
              pagination={heroSlides.length > 1}
            >
              {heroSlides.map((deal) => (
                <swiper-slide key={deal.id}>
                  <SpotlightCard dealId={deal.id} card={toDealCardDeal(deal)} />
                </swiper-slide>
              ))}
            </swiper-container>
          )}
          {!usingAdminSlider && spotlight && fallbackCard && (
            <SpotlightCard dealId={spotlight.id} card={fallbackCard} />
          )}
        </div>
      </div>
    </PageSection>
  );
}
