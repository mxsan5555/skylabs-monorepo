import { useMemo, useState, type ReactNode } from 'react';
import { SecondaryTab, Tabs } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogCategoryWithChildren, CatalogDeal } from '../../../api/catalog';
import { CardRail } from '../../components/card-rail/card-rail';
import content from '../../../content.json';

const t = content.home.sections.dealsNearYou;
const ALL = 'all';

/** One carousel for every deal (nearest-first when the visitor location is known), filtered by
 *  category tabs. Replaces the old Featured / Biggest savings / per-category carousels. */
export function DealsNearYou({
  deals,
  categories,
  renderDeal,
}: {
  deals: CatalogDeal[];
  categories: CatalogCategoryWithChildren[];
  renderDeal: (deal: CatalogDeal) => ReactNode;
}) {
  const [active, setActive] = useState(ALL);
  const tabs = useMemo(
    () => [
      { id: ALL, label: t.allTab },
      ...categories.filter((c) => deals.some((d) => d.category?.id === c.id)).map((c) => ({ id: c.id, label: c.name })),
    ],
    [categories, deals],
  );
  const shown = active === ALL ? deals : deals.filter((d) => d.category?.id === active);

  return (
    <section className="home-band home-band--tint" aria-labelledby="deals-heading">
      <div className="home-container">
        <CardRail
          id="deals-heading"
          heading={t.heading}
          seeAll={t.seeAll}
          seeAllTo={t.seeAllTo}
          railKey={active}
          above={
            tabs.length > 1 ? (
              <Tabs className="home-tabs" aria-label={t.tabsLabel}>
                {tabs.map((tab) => (
                  <SecondaryTab key={tab.id} active={active === tab.id} onClick={() => setActive(tab.id)}>
                    {tab.label}
                  </SecondaryTab>
                ))}
              </Tabs>
            ) : null
          }
        >
          {shown.map(renderDeal)}
        </CardRail>
        {shown.length === 0 && <p className="home-empty body-large">{t.empty}</p>}
      </div>
    </section>
  );
}
