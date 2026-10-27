import { createElement, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import type { CatalogDeal, CatalogHomeHeroSlide } from '../../../api/catalog';
import { getCatalogHomeHero } from '../../../api/catalog';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useMediaQuery } from '../../../hooks/use-media-query';
import { useVisitorLocation } from '../../../location/location-context';
import { formatINR } from '../../../utils/format';
import { imageSrcSet, toDealCardDeal } from './home-data';
import { PageSection } from '../../components/page-section/page-section';
import { OfferCard, type OfferItem, type OfferTag } from '../../components/offer-card/offer-card';
import content from '../../../content.json';
import type { DealCardDeal } from '../../components/deal-card';
import { dealHref } from '../../../catalog/catalog-shell';

const { home } = content;
const heroSrcSet = imageSrcSet(home.hero.image, [640, 960, 1400]);
const AUTOPLAY_MS = 6000;
/** Swiper Element host: options are set as properties, then `initialize()` (its `init="false"`
 *  mode), because the dots live outside the carousel and must be handed over as an element. */
type SwiperHost = HTMLElement & {
  swiper?: { slidePrev: () => void; slideNext: () => void };
  initialize?: () => void;
  [option: string]: unknown;
};

/** The single best-discount deal shown over the hero photo when no slider is live. A broken
 *  thumbnail swaps to a neutral placeholder frame. */
function SpotlightCard({ href, card }: { href: string; card: DealCardDeal }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(card.image) && !imgFailed;
  return (
    <Link to={href} className="home-spotlight">
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
      <Icon className="home-spotlight__arrow" aria-hidden="true">
        arrow_forward
      </Icon>
    </Link>
  );
}

/** Service / Product tag on each slide, so the type is named in words, not only by the card. */
const SLIDE_TAGS: Record<CatalogHomeHeroSlide['type'], OfferTag> = {
  deal: { label: content.offerCard.serviceTag, color: 'primary' },
  product: { label: content.offerCard.productTag, color: 'tertiary', tone: 'tonal' },
};

/** A hero slide as the offer card's item. */
const slideItem = (slide: CatalogHomeHeroSlide): OfferItem =>
  slide.type === 'deal' ? { type: 'deal', deal: slide.deal } : { type: 'product', product: slide.product };

/**
 * Hero (docs/msd/PLANNING.md §7, D26): the page's only h1 and site search on the left; on the
 * right, the visitor's state's slider of deals and products (`GET /catalog/home-hero`, Global /
 * Default when the state has no live slider or the location is unknown). Before the slider loads,
 * or when no slider is live, the photo with the single best-discount deal spotlight shows.
 */
export function HomeHero({ spotlight }: { spotlight?: CatalogDeal }) {
  const navigate = useNavigate();
  const fieldRef = useRef<HTMLElement>(null);
  const carouselRef = useRef<SwiperHost>(null);
  const paginationRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
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
  const hasControls = slides.length > 1;

  // Start the carousel once its slides and the dots element are in the page.
  useEffect(() => {
    const host = carouselRef.current;
    if (!host?.initialize || host.swiper) return;
    Object.assign(host, {
      slidesPerView: 'auto',
      // The gap lives in home.css (--hero-slide-gap), which also sizes the slides.
      spaceBetween: parseFloat(getComputedStyle(host).getPropertyValue('--hero-slide-gap')) || 0,
      // Rewind (not loop): two cards are on screen, so loop would need duplicate slides.
      rewind: hasControls,
      keyboard: { enabled: true },
      autoplay: reduceMotion ? false : { delay: AUTOPLAY_MS, pauseOnMouseEnter: true },
      pagination: hasControls && paginationRef.current ? { el: paginationRef.current, clickable: true } : false,
    });
    host.initialize();
  }, [usingSlider, hasControls, reduceMotion]);
  const fallbackCard = spotlight ? toDealCardDeal(spotlight) : null;

  return (
    <PageSection className="home-hero" aria-labelledby="hero-heading">
      <div className="home-hero__inner">
        <div className="home-hero__copy">
          <h1 id="hero-heading" className="home-hero__title">
            {home.hero.heading}
          </h1>
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
          <div
            className="home-hero__visual home-hero__visual--slider"
            role="region"
            aria-roledescription="carousel"
            aria-label={home.hero.sliderLabel}
          >
            {/* Two cards at a time; slide widths come from CSS (container query), so the carousel
                shows one card and a peek on a narrow column. */}
            <swiper-container
              ref={carouselRef}
              className="home-hero__carousel"
              init="false"
            >
              {slides.map((slide) => (
                <swiper-slide key={slide.id} className="home-hero__slide">
                  <OfferCard slider item={slideItem(slide)} tag={SLIDE_TAGS[slide.type]} color="surface-high" variant="plain" />
                </swiper-slide>
              ))}
            </swiper-container>
            {/* Dots on the left, Previous / Next on the right. The buttons call Swiper directly
                (not its navigation module, which would add a second tab stop to each button). */}
            {hasControls && (
              <div className="home-hero__controls">
                <div ref={paginationRef} className="home-hero__pagination" />
                <div className="home-hero__nav">
                  {createElement(
                    'md-icon-button',
                    {
                      'aria-label': home.hero.prevSlide,
                      onClick: () => carouselRef.current?.swiper?.slidePrev(),
                    },
                    createElement('md-icon', { 'aria-hidden': 'true' }, 'chevron_left'),
                  )}
                  {createElement(
                    'md-icon-button',
                    {
                      'aria-label': home.hero.nextSlide,
                      onClick: () => carouselRef.current?.swiper?.slideNext(),
                    },
                    createElement('md-icon', { 'aria-hidden': 'true' }, 'chevron_right'),
                  )}
                </div>
              </div>
            )}
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
            {spotlight && fallbackCard && <SpotlightCard href={dealHref(spotlight)} card={fallbackCard} />}
          </div>
        )}
      </div>
    </PageSection>
  );
}
