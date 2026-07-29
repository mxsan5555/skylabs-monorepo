import { SkyProductCardWC } from './sky-product-card-wc';
import type { Deal } from '../../types';
import { formatINR } from '../../utils/format';
import { useRef } from 'react';
import '@skylabs-monorepo/shared-ui/carousel';
import { Icon, FilledTonalIconButton, } from '@skylabs-monorepo/shared-ui/react';
import './deal-card.css';
interface DealCardProps {
  deal: Deal;
  favoriteActive: boolean;
  onFavorite: () => void;
}

export function DealCard({
  deal,
  favoriteActive,
  onFavorite,
}: DealCardProps) {
  const swiperRef = useRef<any>(null);
  return (
    <SkyProductCardReact
      imageAlt={deal.imageAlt}
      badge={deal.badge}
      favorite
      favoriteActive={favoriteActive}
      onFavorite={onFavorite}
      eyebrow={deal.providerName}
      heading={deal.title}
      location={deal.location}
      distance={`${deal.distance} km`}
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

    </SkyProductCardReact>
  );
}
