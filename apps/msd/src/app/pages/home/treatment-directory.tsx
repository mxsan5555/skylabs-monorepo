import { Link } from 'react-router-dom';
import type { CatalogPopularTreatmentGroup } from '../../../api/catalog';
import { SectionHead } from '../../components/section-head/section-head';
import { PageSection } from '../../components/page-section/page-section';
import content from '../../../content.json';

const t = content.home.searchByDestination;

/** Popular treatments: plain crawlable search links grouped by treatment family — Admin-managed
 *  via `/account/masters/popular-treatments` (see `popular-treatment.service.ts`'s
 *  `getPublicTreatmentDirectory`), server-filtered to active groups/treatments only. A category
 *  hint (`categorySlug`) sharpens the search when present; the link always works either way. */
export function TreatmentDirectory({ groups }: { groups: CatalogPopularTreatmentGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <PageSection aria-labelledby="treatments-heading">
      <SectionHead id="treatments-heading" heading={t.heading} subheading={t.subheading} />
      <div className="home-directory">
        {groups.map((group) => (
          <div key={group.id} className="home-directory__group">
            <h3 className="home-directory__title title-medium">{group.name}</h3>
            <ul className="home-directory__links">
              {group.treatments.map((treatment) => (
                <li key={treatment.id}>
                  <Link
                    className="body-medium"
                    to={`/explore?q=${encodeURIComponent(treatment.name)}${treatment.categorySlug ? `&category=${encodeURIComponent(treatment.categorySlug)}` : ''}`}
                  >
                    {treatment.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageSection>
  );
}
