import { Link } from 'react-router-dom';
import content from '../../../content.json';

const t = content.home.searchByDestination;

/** Popular treatments: plain crawlable search links grouped by treatment family. */
export function TreatmentDirectory() {
  return (
    <section className="home-band" aria-labelledby="treatments-heading">
      <div className="home-container">
        <div className="home-head home-head--stack">
          <h2 id="treatments-heading" className="headline-small">{t.heading}</h2>
          <p className="home-head__sub body-large">{t.subheading}</p>
        </div>
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
      </div>
    </section>
  );
}
