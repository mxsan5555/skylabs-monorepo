import { createElement, useMemo, useState, type ReactNode } from 'react';
import { Tabs } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogCategoryWithChildren, CatalogDeal } from '../../../api/catalog';
import { CardRail } from '../../components/card-rail/card-rail';
import { SectionHead } from '../../components/section-head/section-head';
import type { HomeCatalog } from './home-data';
import content from '../../../content.json';

const t = content.home.sections.dealsNearYou;
const ALL = 'all';
const PANEL_ID = 'deals-panel';
const tabId = (id: string) => `deals-tab-${id}`;

/** Raw `md-secondary-tab` so `id`/`aria-controls`/`active` render as attributes (the @lit/react
 *  wrapper sets `id` as a JS property only in the browser build, so it is missing from
 *  server-rendered HTML and under jsdom). */
function DealsTab({ id, active, onSelect, children }: { id: string; active: boolean; onSelect: () => void; children: ReactNode }) {
  return createElement('md-secondary-tab', { id: tabId(id), 'aria-controls': PANEL_ID, active, onClick: onSelect }, children);
}

/** One carousel for every deal (nearest-first when the visitor location is known), filtered by
 *  category tabs. While the catalog loads it shows card placeholders; on error, the alert. */
export function DealsNearYou({
  status,
  error,
  deals,
  categories,
  renderDeal,
}: {
  status: HomeCatalog['status'];
  error: string;
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

  if (status === 'ready' && deals.length === 0) return null;
  // A refetch can drop the active category; fall back to All instead of an empty rail.
  const current = tabs.some((tab) => tab.id === active) ? active : ALL;
  const hasTabs = tabs.length > 1;
  const shown = current === ALL ? deals : deals.filter((d) => d.category?.id === current);

  return (
    <section className="home-band home-band--tint" aria-labelledby="deals-heading">
      <div className="home-container">
        {status === 'ready' ? (
          <CardRail
            id="deals-heading"
            heading={t.heading}
            seeAll={t.seeAll}
            seeAllTo={t.seeAllTo}
            railKey={current}
            panel={hasTabs ? { id: PANEL_ID, labelledBy: tabId(current) } : undefined}
            above={
              hasTabs ? (
                <Tabs className="home-tabs" aria-label={t.tabsLabel}>
                  {tabs.map((tab) => (
                    <DealsTab key={tab.id} id={tab.id} active={current === tab.id} onSelect={() => setActive(tab.id)}>
                      {tab.label}
                    </DealsTab>
                  ))}
                </Tabs>
              ) : null
            }
          >
            {shown.map(renderDeal)}
          </CardRail>
        ) : (
          <>
            <SectionHead id="deals-heading" heading={t.heading} seeAll={t.seeAll} seeAllTo={t.seeAllTo} />
            {status === 'loading' ? (
              <div className="home-skeleton__row" role="status" aria-busy="true">
                <span className="sr-only">{content.home.ui.messages.loading}</span>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="home-skeleton__block home-skeleton__block--card" />
                ))}
              </div>
            ) : (
              <p className="error-state" role="alert">{error}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
