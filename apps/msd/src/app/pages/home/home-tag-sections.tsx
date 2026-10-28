import { useEffect, useState, type ReactNode } from 'react';
import { CardRail } from '../../components/card-rail/card-rail';
import { PageSection } from '../../components/page-section/page-section';
import { useVisitorLocation } from '../../../location/location-context';
import {
  getCatalogHomeTagSections,
  type CatalogDeal,
  type CatalogHomeTagSection,
  type CatalogHomeTagSectionTag,
} from '../../../api/catalog';
import content from '../../../content.json';

const { home } = content;

/** Storefront rail order — deliberately different from the admin screen's row order (New, Deal,
 *  Hot Deal, Expire soon); see docs/msd/PLANNING.md §7.1. */
const STOREFRONT_TAG_ORDER: CatalogHomeTagSectionTag[] = ['NEW', 'HOT_DEAL', 'DEAL', 'EXPIRE_SOON'];

/**
 * The four New / Hot Deal / Deal / Expire soon rails (docs/msd/PLANNING.md §7.1), placed right
 * after Deals Near You. Each is its own `PageSection` + `CardRail`, laid out exactly like the
 * Therapists/Featured Products rails further down this page — no hero-style carousel, every item
 * is a deal. A tag renders only once the server resolves it to a section with >=1 eligible deal
 * (the visitor's own state, or Global/Default); a tag with nothing eligible is simply absent.
 */
export function HomeTagSections({ renderDeal }: { renderDeal: (deal: CatalogDeal) => ReactNode }) {
  const { status: locationStatus, state: locationState } = useVisitorLocation();
  const [sections, setSections] = useState<CatalogHomeTagSection[] | null>(null);

  useEffect(() => {
    if (locationStatus === 'locating') return;
    let cancelled = false;
    getCatalogHomeTagSections(locationState ?? undefined)
      .then(({ data }) => {
        if (!cancelled) setSections(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [locationStatus, locationState]);

  if (!sections) return null;
  const byTag = new Map(sections.map((section) => [section.tag, section]));

  return (
    <>
      {STOREFRONT_TAG_ORDER.map((tag) => {
        const section = byTag.get(tag);
        if (!section || section.deals.length === 0) return null;
        const copy = home.sections.homeTagSections[tag];
        const headingId = `home-tag-${tag.toLowerCase()}-heading`;
        return (
          <PageSection key={tag} tone="tint" aria-labelledby={headingId}>
            <CardRail id={headingId} heading={copy.heading} seeAll={copy.seeAll} seeAllTo={copy.seeAllTo}>
              {section.deals.map(renderDeal)}
            </CardRail>
          </PageSection>
        );
      })}
    </>
  );
}

export default HomeTagSections;
