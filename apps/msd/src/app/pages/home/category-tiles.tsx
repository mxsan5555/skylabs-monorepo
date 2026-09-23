import { Link } from 'react-router-dom';
import type { CatalogCategoryWithChildren } from '../../../api/catalog';
import { categoryHref } from '../../../catalog/catalog-shell';
import content from '../../../content.json';

const { home } = content;
const t = home.sections.browseByCategory;
const icons = home.categoryIcons as Record<string, string>;
const seeAllLabel = content.cardRail.seeAllLabel.replace('{seeAll}', t.seeAll).replace('{heading}', t.heading);

/** Category tiles. The heading + link are slotted light DOM so crawlers see real links. */
export function CategoryTiles({ categories }: { categories: CatalogCategoryWithChildren[] }) {
  return (
    <section className="home-band" aria-labelledby="category-heading">
      <div className="home-container">
        <div className="home-head">
          <h2 id="category-heading" className="headline-small">{t.heading}</h2>
          <Link className="home-head__link label-large" to={t.seeAllTo} aria-label={seeAllLabel}>
            {t.seeAll}
          </Link>
        </div>
        {/* list-style: none drops list semantics in Safari; the explicit role restores them. */}
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
        <ul className="home-cats" role="list">
          {categories.map((cat) => (
            <li key={cat.id}>
              <sky-tile-card
                icon={icons[cat.slug] ?? icons.default}
                text={home.categoryTileText.replace('{count}', String(cat.children.length))}
              >
                <h3 slot="headline" className="home-cats__name title-medium">
                  <Link to={categoryHref(cat.slug)} className="home-cats__link">{cat.name}</Link>
                </h3>
              </sky-tile-card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
