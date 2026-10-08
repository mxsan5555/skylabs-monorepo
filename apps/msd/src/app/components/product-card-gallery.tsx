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
}

export function ProductCardGallery({
  images,
  alt,
  layout = 'vertical',
}: ProductCardGalleryProps) {
  const swiperRef = useRef<HTMLElement | null>(null);

  const slidePrevious = () => {
    const swiper = (
      swiperRef.current as HTMLElement & {
        swiper?: {
          slidePrev: () => void;
        };
      }
    )?.swiper;

    swiper?.slidePrev();
  };

  const slideNext = () => {
    const swiper = (
      swiperRef.current as HTMLElement & {
        swiper?: {
          slideNext: () => void;
        };
      }
    )?.swiper;

    swiper?.slideNext();
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <div
      className={`product-card-gallery ${
        layout === 'horizontal'
          ? 'product-card-gallery--horizontal'
          : ''
      }`}
    >
      <swiper-container
        ref={(element) => {
          swiperRef.current = element;
        }}
        slides-per-view="1"
        grab-cursor="true"
        loop={images.length > 1 ? 'true' : 'false'}
      >
        {images.map((image, index) => (
          <swiper-slide key={`${image}-${index}`}>
            <img
              src={image}
              alt={
                index === 0
                  ? alt
                  : `${alt} image ${index + 1}`
              }
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </swiper-slide>
        ))}
      </swiper-container>
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
    </div>
  );
}