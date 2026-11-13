import { useEffect, useRef } from 'react';
import '@skylabs-monorepo/shared-ui/carousel';

import {
  FilledTonalIconButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { fillTemplate } from '../../utils/format';
import content from '../../content.json';

import './product-card-gallery.css';

const t = content.gallery;

interface ProductCardGalleryProps {
  images: string[];
  /** Alt text of the first image; the others read "{alt}, image n of N". */
  alt: string;
  layout?: 'vertical' | 'horizontal';
  slot?: string;
  /** Fill the parent frame (e.g. `sky-product-card`'s media slot, which sets the ratio in grid
   *  view and stretches to the row in list view) instead of keeping its own 3:2 box. */
  fill?: boolean;
}

type SwiperHost = HTMLElement & {
  swiper?: {
    slidePrev: () => void;
    slideNext: () => void;
  };
  initialize?: () => void;
};

/** Card image slider (Swiper Element): one image per slide, previous / next buttons named after
 *  the item, and page dots when there is more than one image. */
export function ProductCardGallery({
  images,
  alt,
  layout = 'vertical',
  slot,
  fill = false,
}: ProductCardGalleryProps) {
  const swiperRef = useRef<SwiperHost | null>(null);
  const hasMultipleImages = images.length > 1;

  // Options go in as properties before init: React 19 would set a string attribute value as
  // a property (pagination "true"), which Swiper cannot read.
  useEffect(() => {
    const el = swiperRef.current;
    if (!el || el.swiper || !el.initialize) return;
    Object.assign(el, {
      slidesPerView: 1,
      grabCursor: true,
      // Inside a card rail or the hero carousel: this slider moves, not the rail around it.
      nested: true,
      ...(hasMultipleImages ? { loop: true, pagination: true } : {}),
    });
    el.initialize();
  }, [hasMultipleImages]);

  if (images.length === 0) {
    return null;
  }

  const count = String(images.length);
  const className = [
    'product-card-gallery',
    layout === 'horizontal' && 'product-card-gallery--horizontal',
    fill && 'product-card-gallery--fill',
  ]
    .filter(Boolean)
    .join(' ');

  // The buttons sit over the card's stretched link: keep the click from opening the detail page.
  const navButton = (direction: 'prev' | 'next') => (
    <FilledTonalIconButton
      className={`product-card-gallery__button product-card-gallery__button--${direction}`}
      aria-label={fillTemplate(direction === 'prev' ? t.previous : t.next, { title: alt })}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (direction === 'prev') swiperRef.current?.swiper?.slidePrev();
        else swiperRef.current?.swiper?.slideNext();
      }}
    >
      <Icon aria-hidden="true">
        {direction === 'prev' ? 'navigate_before' : 'navigate_next'}
      </Icon>
    </FilledTonalIconButton>
  );

  return (
    <div slot={slot} className={className}>
      <swiper-container
        ref={(element) => {
          swiperRef.current = element as SwiperHost | null;
        }}
        init="false"
      >
        {images.map((image, index) => (
          <swiper-slide key={`${image}-${index}`}>
            <img
              src={image}
              alt={
                index === 0
                  ? alt
                  : fillTemplate(t.imageAlt, { title: alt, n: String(index + 1), count })
              }
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          </swiper-slide>
        ))}
      </swiper-container>

      {hasMultipleImages && (
        <>
          {navButton('prev')}
          {navButton('next')}
        </>
      )}
    </div>
  );
}
