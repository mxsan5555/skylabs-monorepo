import { SkyProductCardWC } from './sky-product-card-wc';
import { formatINR } from '../../utils/format';
import { useRef } from 'react';
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
}

interface DealCardProps {
  deal: DealCardDeal;
  favoriteActive: boolean;
  onFavorite: () => void;
  /** Vendor-name link target, e.g. `/vendor/:slug` — only ever set for real deals (a real
   *  `CatalogDeal.vendor.slug` is always present for a visible deal); mock-data callers omit it
   *  and the vendor name simply renders unlinked, same as before. */
  eyebrowHref?: string;
}

export function DealCard({
  deal,
  favoriteActive,
  onFavorite,
  eyebrowHref,
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
      href={`/deal/${deal.id}`}
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

    </SkyProductCardWC>

  );
}
