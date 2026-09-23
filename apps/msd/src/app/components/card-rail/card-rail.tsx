import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import content from '../../../content.json';
import './card-rail.css';

type SwiperHost = HTMLElement & { swiper?: { slidePrev(): void; slideNext(): void } };

const t = content.cardRail;
const fill = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, v), template);

export interface CardRailProps {
  /** Id of the rendered h2; the parent <section aria-labelledby> points at it. */
  id: string;
  heading: string;
  seeAll: string;
  seeAllTo: string;
  /** Remounts the carousel when the slide set is swapped wholesale (e.g. a tab change). */
  railKey?: string;
  /** Content between the header row and the track (e.g. tabs). */
  above?: ReactNode;
  children: ReactNode;
}

/** Carousel section: heading, "See all" link and prev/next buttons in one row (so arrows never
 *  cover cards), then a Swiper track of `<swiper-slide className="card-rail__slide">` children. */
export function CardRail({ id, heading, seeAll, seeAllTo, railKey, above, children }: CardRailProps) {
  const swiperRef = useRef<SwiperHost>(null);
  return (
    <div className="card-rail">
      <div className="card-rail__head">
        <h2 id={id} className="card-rail__title headline-small">{heading}</h2>
        <div className="card-rail__actions">
          <Link className="card-rail__link label-large" to={seeAllTo} aria-label={fill(t.seeAllLabel, { seeAll, heading })}>
            {seeAll}
            <Icon aria-hidden="true">arrow_forward</Icon>
          </Link>
          <OutlinedIconButton className="card-rail__nav" aria-label={fill(t.previous, { heading })} onClick={() => swiperRef.current?.swiper?.slidePrev()}>
            <Icon>chevron_left</Icon>
          </OutlinedIconButton>
          <OutlinedIconButton className="card-rail__nav" aria-label={fill(t.next, { heading })} onClick={() => swiperRef.current?.swiper?.slideNext()}>
            <Icon>chevron_right</Icon>
          </OutlinedIconButton>
        </div>
      </div>
      {above}
      <div className="card-rail__track">
        <swiper-container key={railKey} ref={swiperRef} slides-per-view="auto" space-between={16} grab-cursor="true">
          {children}
        </swiper-container>
      </div>
    </div>
  );
}
