
import { useRef } from 'react';
import '@skylabs-monorepo/shared-ui/carousel';

import {
  FilledTonalIconButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';

import './product-card-gallery.css';

interface ProductCardGalleryProps {
  images: string[];
  alt: string;
  layout?: 'vertical' | 'horizontal';
  slot?: string;
}

type SwiperHost = HTMLElement & {
  swiper?: {
    slidePrev: () => void;
    slideNext: () => void;
  };
};

export function ProductCardGallery({
  images,
  alt,
  layout = 'vertical',
  slot,
}: ProductCardGalleryProps) {
  const swiperRef = useRef<SwiperHost | null>(null);

  const slidePrevious = () => {
    swiperRef.current?.swiper?.slidePrev();
  };

  const slideNext = () => {
    swiperRef.current?.swiper?.slideNext();
  };

  if (images.length === 0) {
    return null;
  }

  const hasMultipleImages = images.length > 1;

  return (
    <div
      slot={slot}
      className={`product-card-gallery ${
        layout === 'horizontal'
          ? 'product-card-gallery--horizontal'
          : ''
      }`}
    >
      <swiper-container
        ref={(element) => {
          swiperRef.current = element as SwiperHost | null;
        }}
        slides-per-view="1"
        grab-cursor="true"
        loop={hasMultipleImages ? 'true' : 'false'}
      >
        {images.map((image, index) => (
          <swiper-slide key={`${image}-${index}`}>
            <img
              src={image}
              alt={index === 0 ? alt : `${alt} image ${index + 1}`}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </swiper-slide>
        ))}
      </swiper-container>

      {hasMultipleImages && (
        <>
          <FilledTonalIconButton
            className="product-card-gallery__button product-card-gallery__button--prev"
            aria-label="Previous image"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              slidePrevious();
            }}
          >
            <Icon aria-hidden="true">navigate_before</Icon>
          </FilledTonalIconButton>

          <FilledTonalIconButton
            className="product-card-gallery__button product-card-gallery__button--next"
            aria-label="Next image"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              slideNext();
            }}
          >
            <Icon aria-hidden="true">navigate_next</Icon>
          </FilledTonalIconButton>
        </>
      )}
    </div>
  );
}
