import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChipSet,
  FilterChip,
  Icon,
  Tabs,
  PrimaryTab,
  FilledButton,
} from '@skylabs-monorepo/shared-ui/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { getDealsByCategory } from '../../../data/deals';
import { getCategoryBySlug } from '../../../data/categories';
import { DealCard } from '../../components/deal-card';
import { Breadcrumb } from '../../components/breadcrumb';
import type { DealSort } from '../../../types';
import content from '../../../content.json';
import './category.css';

const SORT_OPTIONS = content.category.sortOptions as { value: DealSort; label: string }[];

export function Category() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toggle, has } = useWishlist();
  const [sort, setSort] = useState<DealSort>('popular');
  const [subcategoryIdx, setSubcategoryIdx] = useState(0);

  const category = getCategoryBySlug(slug);

  if (!category) {
    return (
      <div className="category-page category-page--empty">
        <title>Category Not Found | MSD</title>
        <sky-info-card
          icon="search_off"
          heading="Category not found"
          subheading="Try browsing all our deals."
        />
        <FilledButton onClick={() => navigate('/explore')}>Explore Deals</FilledButton>
      </div>
    );
  }

  const allDeals = getDealsByCategory(slug);
  // Tab 0 = "All", tabs 1+ = subcategories[idx - 1]
  const activeSubcat = subcategoryIdx === 0 ? undefined : category.subcategories[subcategoryIdx - 1];

  let filtered = activeSubcat
    ? allDeals.filter((d) => d.subcategorySlug === activeSubcat.slug)
    : allDeals;

  if (filtered.length === 0 && activeSubcat) filtered = allDeals;

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'rating': return b.rating - a.rating;
      case 'price-asc': return a.price - b.price;
      case 'price-desc': return b.price - a.price;
      case 'distance': return a.distance - b.distance;
      default: return (b.reviews - a.reviews);
    }
  });

  return (
    <div className="category-page">
      <title>{`${category.name} Deals – MSD | MySpaDeal`}</title>
      <meta
        name="description"
        content={`Book the best ${category.name.toLowerCase()} deals near you. ${category.description}`}
      />

      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <Breadcrumb
        className="category-page__breadcrumb"
        items={[
          { label: 'Home', to: '/' },
          { label: 'Categories', to: '/explore' },
          { label: category.name },
        ]}
      />

      {/* ── Category hero ──────────────────────────────────────────────── */}
      <header className="category-page__hero">
        <div className="category-page__hero-inner">
          <div className="category-page__hero-icon" aria-hidden="true">
            <Icon>{category.icon}</Icon>
          </div>
          <div>
            <h1 className="category-page__title">{category.name}</h1>
            <p className="category-page__subtitle">
              {category.serviceCount} services · {category.description}
            </p>
          </div>
        </div>
      </header>

      {/* ── Subcategory tabs ───────────────────────────────────────────── */}
      {category.subcategories.length > 0 && (
        <div className="category-page__tabs-wrap">
          <Tabs
            className="category-page__tabs"
            onChange={(e) =>
              setSubcategoryIdx((e.target as unknown as { activeTabIndex: number }).activeTabIndex)
            }
          >
            <PrimaryTab active={subcategoryIdx === 0}>All</PrimaryTab>
            {category.subcategories.map((sub, i) => (
              <PrimaryTab key={sub.id} active={subcategoryIdx === i + 1}>
                {sub.name}
              </PrimaryTab>
            ))}
          </Tabs>
        </div>
      )}

      {/* ── Sort chips ─────────────────────────────────────────────────── */}
      <div className="category-page__sort">
        <div className="category-page__sort-inner">
          <ChipSet>
            {SORT_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                selected={sort === opt.value}
                onClick={() => setSort(opt.value)}
              />
            ))}
          </ChipSet>
          <p className="category-page__count" aria-live="polite" aria-atomic="true">
            {sorted.length} {sorted.length === 1 ? 'deal' : 'deals'}
          </p>
        </div>
      </div>

      {/* ── Deals grid ─────────────────────────────────────────────────── */}
      <section className="category-page__grid-wrap" aria-label={`${category.name} deals`}>
        <div className="category-page__grid-inner">
          {sorted.length === 0 ? (
            <div className="category-page__empty">
              <sky-info-card
                icon="sentiment_dissatisfied"
                heading="No deals found"
                subheading="Try a different subcategory or browse all deals."
              />
            </div>
          ) : (
            <ul className="category-page__grid">
              {sorted.map((deal) => (
                <li key={deal.id}>
                  <DealCard
                    deal={deal}
                    favoriteActive={has(deal.id)}
                    onFavorite={() => toggle(deal.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default Category;
