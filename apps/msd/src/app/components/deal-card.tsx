import { SkyProductCardWC } from './sky-product-card-wc';
import { formatINR } from '../../utils/format';
import { useRef, type ReactNode } from 'react';
import '@skylabs-monorepo/shared-ui/carousel';
import { Icon, FilledTonalIconButton } from '@skylabs-monorepo/shared-ui/react';
import './deal-card.css';
import '@skylabs-monorepo/shared-ui';

/**
 * What `DealCard` actually needs to render — a relaxed superset of the mock `Deal` type (still
 * satisfied by it structurally, so existing mock-data callers like `home-deal-card.tsx` keep
 * compiling unchanged) that also accepts a real `CatalogDeal` adapted to this shape. Real deals
 * have no rating/reviews/distance/location/badge fields (none exist on the real `Deal` model),
 * so those stay optional here and are simply omitted rather than fabricated when absent.
 */
export interface DealCardDeal {
  id: string;
  title: string;
  image: string;
  imageAlt: string;
  gallery?: string[];
  video?: string | null;
  badge?: string;
  providerName?: string;
  location?: string;
  distance?: number;
  rating?: number;
  reviews?: number;
  price: number;
  originalPrice?: number;
  discount?: number;
  priceNote?: string;
  /** True for a real PRODUCT deal (`deal.product` set) — routes to `/products/:id` and, when
   *  `onAddToCart` is supplied, shows a real "Add to Cart" action instead of the default
   *  click-through-only card. A service deal (the default) still routes to `/deal/:id`. */
  isProduct?: boolean;
}

interface DealCardProps {
  deal: DealCardDeal;
  favoriteActive: boolean;
  onFavorite: () => void;
  /** Vendor-name link target, e.g. `/vendor/:slug` — only ever set for real deals (a real
   *  `CatalogDeal.vendor.slug` is always present for a visible deal); mock-data callers omit it
   *  and the vendor name simply renders unlinked, same as before. */
  eyebrowHref?: string;
  /** Extra action content below the price (e.g. a real "Add to Cart" button for a product deal)
   *  — wrapped in a stopPropagation/preventDefault div (same pattern as category.tsx's existing
   *  card action row) so the click never falls through to the card's own stretched link. */
  actions?: ReactNode;
}

export function DealCard({
  deal,
  favoriteActive,
  onFavorite,
  eyebrowHref,
  actions,
}: DealCardProps) {
  const swiperRef = useRef<any>(null);
  return (
    <SkyProductCardWC
      imageAlt={deal.imageAlt}
      badge={deal.badge}
      favorite
      favoriteActive={favoriteActive}
      onFavorite={onFavorite}
      eyebrow={deal.providerName}
      eyebrowHref={eyebrowHref}
      heading={deal.title}
      location={deal.location}
      distance={deal.distance !== undefined ? `${deal.distance} km` : undefined}
      rating={deal.rating}
      reviews={deal.reviews}
      originalPrice={
        deal.originalPrice
          ? formatINR(deal.originalPrice)
          : undefined
      }
      price={formatINR(deal.price)}
      discount={
        deal.discount
          ? `-${deal.discount}%`
          : undefined
      }
      priceNote={deal.priceNote}
      href={deal.isProduct ? `/products/${deal.id}` : `/deal/${deal.id}`}
    >

      <div slot="media" className="deal-card-slider">
        <swiper-container
          ref={swiperRef}
          navigation={false}
          pagination={false}
          loop={true}
          grab-cursor={true}
        >
          {(deal.gallery?.length ? deal.gallery : [deal.image]).map((img) => (
            <swiper-slide key={img}>
              <img
                src={img}
                alt={deal.imageAlt}
              />
            </swiper-slide>
          ))}
          {deal.video && (
            <swiper-slide key={deal.video}>
              <video src={deal.video} controls muted />
            </swiper-slide>
          )}
        </swiper-container>

        <FilledTonalIconButton
          className="slider-btn slider-btn--prev"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            swiperRef.current?.swiper.slidePrev();
          }}
        >
          <Icon aria-hidden="true">navigate_before</Icon>
        </FilledTonalIconButton>

        <FilledTonalIconButton
          className="slider-btn slider-btn--next"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            swiperRef.current?.swiper.slideNext();
          }}
        >
          <Icon aria-hidden="true">navigate_next</Icon>
        </FilledTonalIconButton>
      </div>

      {actions && (
        <div
          className="deal-card__actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {actions}
        </div>
      )}

    </SkyProductCardWC>

  );
}
