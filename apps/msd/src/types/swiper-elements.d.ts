/**
 * JSX typings for Swiper Element custom tags (`<swiper-container>` /
 * `<swiper-slide>`) used in msd. The elements are registered by
 * `@skylabs-monorepo/shared-ui/carousel`; this file only teaches TSX about the
 * tags and the Swiper attributes we use, so raw tags typecheck without `any`.
 *
 * App-local (each app owns its own types). The full Swiper attribute list lives
 * in the Swiper docs; add more here as the app uses them.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/** Swiper boolean attrs accept a real boolean or the string form. */
type SwiperBool = boolean | 'true' | 'false';

interface SwiperContainerAttributes {
  'slides-per-view'?: number | string;
  'space-between'?: number | string;
  'centered-slides'?: SwiperBool;
  loop?: SwiperBool;
  'grab-cursor'?: SwiperBool;
  'free-mode'?: SwiperBool;
  navigation?: SwiperBool;
  pagination?: SwiperBool;
  'pagination-type'?: 'bullets' | 'fraction' | 'progressbar';
  'pagination-dynamic-bullets'?: SwiperBool;
  scrollbar?: SwiperBool;
  speed?: number | string;
  init?: SwiperBool;
}

type SwiperElement<T = SwiperContainerAttributes> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  T;

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'swiper-container': SwiperElement;
      // 'swiper-slide': SwiperElement<Record<string, never>>;
       'swiper-slide': SwiperElement;
    }
  }
}
