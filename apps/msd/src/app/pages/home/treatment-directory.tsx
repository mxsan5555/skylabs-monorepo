import { Link } from 'react-router-dom';
import { SectionHead } from '../../components/section-head/section-head';
import { PageSection } from '../../components/page-section/page-section';
import content from '../../../content.json';

const t = content.home.searchByDestination;

/** Popular treatments: plain crawlable search links grouped by treatment family. */
export function TreatmentDirectory() {
  return (
    <PageSection aria-labelledby="treatments-heading">
      <SectionHead id="treatments-heading" heading={t.heading} subheading={t.subheading} />
      <div className="home-directory">
        {t.columns.flat().map((group) => (
          <div key={group.title} className="home-directory__group">
            <h3 className="home-directory__title title-medium">{group.title}</h3>
            <ul className="home-directory__links">
              {group.items.map((item) => (
                <li key={item}>
                  <Link className="body-medium" to={`/explore?q=${encodeURIComponent(item)}`}>{item}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageSection>
  );
}
