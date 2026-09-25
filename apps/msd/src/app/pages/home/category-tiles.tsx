import { Link } from 'react-router-dom';
import type { CatalogCategoryWithChildren } from '../../../api/catalog';
import { categoryHref } from '../../../catalog/catalog-shell';
import { SectionHead } from '../../components/section-head/section-head';
import content from '../../../content.json';

const { home } = content;
const t = home.sections.browseByCategory;
const icons = home.categoryIcons as Record<string, string>;

/** "1 treatment" / "{n} treatments"; nothing at 0. */
function tileText(count: number): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? home.categoryTileTextOne : home.categoryTileText.replace('{count}', String(count));
}

/** Category tiles. The heading + link are slotted light DOM so crawlers see real links. */
export function CategoryTiles({ categories }: { categories: CatalogCategoryWithChildren[] }) {
  return (
    <section className="home-band" aria-labelledby="category-heading">
      <div className="home-container">
        <SectionHead id="category-heading" heading={t.heading} seeAll={t.seeAll} seeAllTo={t.seeAllTo} />
        {/* list-style: none drops list semantics in Safari; the explicit role restores them. */}
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
        <ul className="home-cats" role="list">
          {categories.map((cat) => (
            <li key={cat.id}>
              <sky-tile-card
                color="secondary"
                icon-style="surface"
                icon={icons[cat.slug] ?? icons.default} text={tileText(cat.children.length)}>
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
