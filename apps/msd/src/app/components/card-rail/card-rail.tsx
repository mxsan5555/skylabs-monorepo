import { useRef, type ReactNode } from 'react';
import { Icon, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import content from '../../../content.json';
import { SectionHead } from '../section-head/section-head';
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
  /** Wraps the track in a tabpanel when `above` holds tabs that control it. */
  panel?: { id: string; labelledBy?: string };
  children: ReactNode;
}

/** Carousel section: heading, "See all" link and prev/next buttons in one row (so arrows never
 *  cover cards), then a Swiper track of `<swiper-slide className="card-rail__slide">` children. */
export function CardRail({ id, heading, seeAll, seeAllTo, railKey, above, panel, children }: CardRailProps) {
  const swiperRef = useRef<SwiperHost>(null);
  const track = (
    <div className="card-rail__track">
      {/* a11y: Swiper's A11y module adds slide roles/labels and, by keeping its default
          scrollOnFocus:true, slides a card into view when Tab moves focus onto something
          inside it — so keyboard users never focus an off-screen slide. */}
      <swiper-container
        key={railKey}
        ref={swiperRef}
        slides-per-view="auto"
        space-between={16}
        grab-cursor="true"
        a11y="true"
      >
        {children}
      </swiper-container>
    </div>
  );
  return (
    <div className="card-rail">
      <SectionHead
        id={id}
        heading={heading}
        seeAll={seeAll}
        seeAllTo={seeAllTo}
        actions={
          <>
            <OutlinedIconButton className="card-rail__nav" aria-label={fill(t.previous, { heading })} onClick={() => swiperRef.current?.swiper?.slidePrev()}>
              <Icon>chevron_left</Icon>
            </OutlinedIconButton>
            <OutlinedIconButton className="card-rail__nav" aria-label={fill(t.next, { heading })} onClick={() => swiperRef.current?.swiper?.slideNext()}>
              <Icon>chevron_right</Icon>
            </OutlinedIconButton>
          </>
        }
      />
      {above}
      {panel ? (
        <div role="tabpanel" id={panel.id} aria-labelledby={panel.labelledBy}>
          {track}
        </div>
      ) : (
        track
      )}
    </div>
  );
}
