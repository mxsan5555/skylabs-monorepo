
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

interface HomeTagSectionsProps {
  renderDeal: (
    deal: CatalogDeal,
    tag: CatalogHomeTagSectionTag
  ) => ReactNode;
}

export function HomeTagSections({ renderDeal }: HomeTagSectionsProps) {
  const {
    status: locationStatus,
    state: locationState,
  } = useVisitorLocation();

  const [sections, setSections] =
    useState<CatalogHomeTagSection[] | null>(null);

  useEffect(() => {
    if (locationStatus === 'locating') return;

    let cancelled = false;

    getCatalogHomeTagSections(locationState ?? undefined)
      .then(({ data }) => {
        if (!cancelled) {
          setSections(data ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSections([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locationStatus, locationState]);

  if (!sections) return null;

  return (
    <>
      {sections.map((section) => {
        if (!section.deals?.length) return null;

        const headingId = `home-tag-${section.tag.toLowerCase()}-heading`;

        return (
          <PageSection
            key={section.tag}
            tone="tint"
            aria-labelledby={headingId}
          >
            <CardRail
              id={headingId}
              heading={section.title}
              seeAll="See All"
              seeAllTo="/deals"
            >
              {section.deals.map((deal) =>
                renderDeal(deal, section.tag)
              )}
            </CardRail>
          </PageSection>
        );
      })}
    </>
  );
}

export default HomeTagSections;
