import { createElement, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import type { CatalogDeal, CatalogHomeHeroSlide } from '../../../api/catalog';
import { getCatalogHomeHero } from '../../../api/catalog';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useVisitorLocation } from '../../../location/location-context';
import { formatINR } from '../../../utils/format';
import { imageSrcSet, toDealCardDeal, toProductCardDeal } from './home-data';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
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

/** One hero slide: the shared product card plus its own Book / Buy button. The button sits
 *  outside the card because the card is already one stretched link (no nested interactives). */
function HeroSlide({ slide }: { slide: CatalogHomeHeroSlide }) {
  const isDeal = slide.type === 'deal';
  const card = isDeal ? toDealCardDeal(slide.deal) : toProductCardDeal(slide.product);
  const href = isDeal ? `/deal/${slide.deal.id}` : `/products/${slide.product.id}`;
  return (
    <div className="home-hero__slide">
      <SkyProductCardWC
        variant="outlined"
        gallery={card.gallery ?? (card.image ? [card.image] : undefined)}
        imageAlt={card.imageAlt}
        eyebrow={card.providerName}
        heading={card.title}
        location={card.location}
        price={formatINR(card.price)}
        originalPrice={card.originalPrice ? formatINR(card.originalPrice) : undefined}
        discount={card.discount ? `${card.discount}% OFF` : undefined}
        priceNote={card.priceNote}
        href={href}
      />
      {createElement(
        'md-filled-button',
        { href, 'aria-label': (isDeal ? home.hero.bookAria : home.hero.buyAria).replace('{title}', card.title) },
        isDeal ? home.hero.bookLabel : home.hero.buyLabel,
      )}
    </div>
  );
}

/**
 * Hero (docs/msd/PLANNING.md §7, D26): the page's only h1 and site search on the left; on the
 * right, the visitor's state's slider of deals and products (`GET /catalog/home-hero`, Global /
 * Default when the state has no live slider or the location is unknown). Before the slider loads,
 * or when no slider is live, the photo with the single best-discount deal spotlight shows.
 */
export function HomeHero({ spotlight }: { spotlight?: CatalogDeal }) {
  const navigate = useNavigate();
  const fieldRef = useRef<HTMLElement>(null);
  const { status: locationStatus, state: locationState } = useVisitorLocation();
  const [heroSlides, setHeroSlides] = useState<CatalogHomeHeroSlide[] | null>(null);

  useEffect(() => {
    if (locationStatus === 'locating') return;
    let cancelled = false;
    getCatalogHomeHero(locationState ?? undefined)
      .then(({ data }) => {
        if (!cancelled) setHeroSlides(data?.slides ?? []);
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

  const slides = heroSlides ?? [];
  const usingSlider = slides.length > 0;
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

        {usingSlider ? (
          <div className="home-hero__visual" role="region" aria-roledescription="carousel" aria-label={home.hero.sliderLabel}>
            <swiper-container
              slides-per-view="1"
              space-between="16"
              loop={slides.length > 1}
              autoplay-delay="5000"
              autoplay-pause-on-mouse-enter="true"
              pagination={slides.length > 1}
              pagination-clickable="true"
            >
              {slides.map((slide) => (
                <swiper-slide key={slide.id}>
                  <HeroSlide slide={slide} />
                </swiper-slide>
              ))}
            </swiper-container>
          </div>
        ) : (
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
            {spotlight && fallbackCard && <SpotlightCard dealId={spotlight.id} card={fallbackCard} />}
          </div>
        )}
      </div>
    </PageSection>
  );
}
