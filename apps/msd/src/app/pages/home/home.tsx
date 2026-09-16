import { useNavigate, NavLink } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect } from 'react';
import { ListItem, List, FilledTonalIconButton, FilledButton, TextButton, Icon, Tabs, SecondaryTab, OutlinedTextField, AssistChip, } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { listCatalogCategories, listCatalogDeals, type CatalogCategoryWithChildren, type CatalogDeal } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { DealCard, type DealCardDeal } from '../../components/deal-card';
import { resolveDealMedia } from '../../../utils/media';
import content from '../../../content.json';
import './home.css';
import { useCurrentLocation } from "../../../hooks/useCurrentLocation";
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
const { home } = content;
const premiumHero = home.premiumHero;
const heroImages = home.heroImages as string[];

/**
 * Adapts a real `CatalogDeal` into the shape `DealCard` renders. Real deals carry no
 * rating/reviews (no such fields exist on the real `Deal` model) — those stay `undefined` here
 * rather than fabricated. `location`/`distance` ARE real when available: `location` is the
 * deal's own branch city, `distance` is the real Haversine `distanceKm` computed server-side only
 * when the caller's coordinates were sent (see `useCurrentLocation`) — both stay `undefined`
 * rather than a fake placeholder when the underlying data isn't there.
 *
 * Deal is always a service offering now — Product is a fully independent catalog entity (see
 * msd-api's Product schema doc comment), never wrapped in a Deal.
 */
function toDealCardDeal(deal: CatalogDeal): DealCardDeal {
  const title = deal.title;
  const salePrice = Number(deal.salePrice);
  const originalPrice = deal.originalPrice ? Number(deal.originalPrice) : undefined;
  const media = resolveDealMedia(deal);
  return {
    id: deal.id,
    title,
    image: media.images[0] ?? '',
    imageAlt: title,
    gallery: media.images.length > 0 ? media.images : undefined,
    video: media.video,
    providerName: deal.vendor?.businessName ?? undefined,
    location: deal.branch?.city ?? undefined,
    distance: deal.distanceKm != null ? Math.round(deal.distanceKm * 10) / 10 : undefined,
    price: salePrice,
    originalPrice: originalPrice && originalPrice !== salePrice ? originalPrice : undefined,
    discount: deal.discountPercent ?? undefined,
    priceNote: deal.durationMinutes ? `${deal.durationMinutes} min` : undefined,
    tag: deal.popularTags?.[0]?.name,
  };
}

function SectionHeader({ id, heading, seeAll, seeAllTo, }: {
  id: string;
  heading: string;
  seeAll: string;
  seeAllTo: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="home-section__header">
      <h2 id={id} className="home-section__heading">{heading}</h2>
      <TextButton onClick={() => navigate(seeAllTo)}> {seeAll}
        <Icon slot="trailing-icon" aria-hidden="true">chevron_right</Icon>
      </TextButton>
    </div>
  );
}
export function Home() {
  const vacationSwiperRef = useRef<any>(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toggle, has } = useWishlist();
  const spaFinder = content.home.spaFinderHero;
  const [selectedTab, setSelectedTab] = useState('all');
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const [dealsData, setDealsData] = useState<CatalogDeal[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<CatalogDeal[]>([]);
  const { location, coords } = useCurrentLocation();
  const shortLocation = location?.split(",")[2]?.trim() ?? location;

  // Single batched fetch — re-runs the moment real coordinates arrive (permission granted after
  // the first render, or denied/unavailable and staying null forever) so the page refreshes to
  // nearest-first data without a full reload; every section below (category grid, featured, hot,
  // the per-popular-category carousels, and each category card's deal count) derives from these
  // two already-fetched arrays via client-side grouping/filtering, never a per-section API call.
  // Every Deal is a service offering (Product is a fully independent catalog entity — see
  // toDealCardDeal's doc comment) — `DealCard` always routes to `/deal/:id`.
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError('');
    Promise.all([
      listCatalogCategories(),
      listCatalogDeals({ pageSize: 100, latitude: coords?.latitude, longitude: coords?.longitude }),
    ])
      .then(([categoriesRes, dealsRes]) => {
        if (cancelled) return;
        setCategories(categoriesRes.data ?? []);
        setDealsData(dealsRes.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalogError(err instanceof ApiRequestError ? err.message : 'Could not load home page content.');
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude]);

  // "Featured" = newest real deals — no `isFeatured` flag exists on the real `Deal` model. The
  // batched fetch above already comes back in the backend's default `sort=newest` order, so this
  // just caps the showcase to a sensible carousel length.
  const safeDealsData = dealsData ?? [];

  const featuredDeals = useMemo(
    () => safeDealsData.slice(0, 12),
    [safeDealsData],
  );

  const hotDeals = useMemo(
    () =>
      [...safeDealsData].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0),),
    [safeDealsData],
  );

  // Real `Category.isPopular` rows (admin-toggled — see `masters/categories.tsx`'s Popular
  // switch), sorted by the same `sortOrder` the admin screen exposes. Replaces the old
  // `MOCK_CATEGORY_MATCH` keyword-guessing table entirely — no more brittle name/slug matching.
  const popularCategories = useMemo(
    () =>
      [...categories]
        .filter((c) => c.isPopular)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [categories],
  );

  // One horizontal carousel per popular category — client-side filtered from the already-
  // batched `dealsData` fetch (a Deal's own `categoryId` is always the top-level category, same
  // filter a server-side `listCatalogDeals({ categoryId })` call would apply).
  const popularCategoryDeals = useMemo(
    () =>
      popularCategories.map((cat) => ({
        category: cat,
        deals: safeDealsData.filter((d) => d.category?.id === cat.id).slice(0, 6),
      })),
    [popularCategories, safeDealsData],
  );

  // "Hot Right Now" tabs are now the popular categories themselves (plus "All Deals") instead of
  // the old fixed keyword-bucket list — a service/product deal is filtered by its real
  // `category.id`, never a name/slug guess.
  const hotTabs = useMemo(
    () => [
      { label: home.sections.hotRightNow.tabs[0]?.label ?? 'All Deals', value: 'all' },
      ...popularCategories.map((cat) => ({ label: cat.name, value: cat.id })),
    ],
    [popularCategories],
  );
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      listCatalogDeals({ search: query, pageSize: spaFinder.suggestionLimit })
        .then(({ data }) => {
          if (cancelled) return;
          setSuggestions(data ?? []);
          setShowSuggestions(true);
        })
        .catch(() => {
          if (cancelled) return;
          setSuggestions([]);
          setShowSuggestions(true);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, spaFinder.suggestionLimit]);

  const filteredHotDeals = useMemo(() => {
    if (selectedTab === 'all') {
      return hotDeals;
    }
    return hotDeals.filter((deal) => deal.category?.id === selectedTab);
  }, [selectedTab, hotDeals]);

  // Every Deal is a service offering now (Product is independent — see toDealCardDeal's doc
  // comment).
  function categoryDealCount(categoryId: string) {
    return dealsData.filter((d) => d.category?.id === categoryId).length;
  }

  function renderDealCarousel(deals: CatalogDeal[]) {
    return (
      <div className="home-carousel">
        <swiper-container
          navigation="true"
          slides-per-view="auto"
          space-between={16}
          free-mode="true"
          grab-cursor="true"
        >
          {deals.map((deal) => {
            return (
              <swiper-slide key={deal.id} style={{ width: '260px', height: 'auto' }} >
                <DealCard
                  deal={toDealCardDeal(deal)}
                  eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
                  favoriteActive={isAuthenticated && has(deal.id)}
                  onFavorite={() => {
                    if (!isAuthenticated) {
                      navigate("/sign-in");
                      return;
                    }
                    toggle(deal.id);
                  }}
                  actions={
                    <FilledButton onClick={() => navigate(`/deal/${deal.id}`)}>
                      <Icon slot="icon" aria-hidden="true">
                        calendar_month
                      </Icon>
                      Book
                    </FilledButton>
                  }
                />
              </swiper-slide>
            );
          })}
        </swiper-container>
      </div>
    );
  }
  function handleFavorite(id: string) {
    if (!isAuthenticated) {
      navigate('/sign-in');
      return;
    }
    toggle(id);
  }

  // Loading → Real Data, never Mock → Real Data: the entire page (including the content.json-only
  // sections interleaved below) waits on this one batched fetch, matching `category.tsx`'s
  // existing whole-page loading/error convention.
  if (catalogLoading) {
    return <p className="loading-state"> {home.ui.messages.loading}</p>;
  }
  if (catalogError) {
    return <p className="error-state" role="alert">{catalogError}</p>;
  }

  return (
    <div className="home">
      <title>{content.meta.home.title}</title>
      <meta name="description" content={content.meta.home.description} />
      <section className="home__premium-hero">
        <div className="home__premium-content">
          <div className="home__premium-left">
            <h1 className="home__premium-title"> {premiumHero.heading} </h1>
            <p className="home__premium-subtitle"> {premiumHero.subheading}</p>
            <div
              className="home__premium-tabs"
              role="navigation"
              aria-label={home.ui.accessibility.browseWellnessCategories}
            >
              {categories.map((category) => (
                <NavLink
                  key={category.id}
                  to={`/category/${category.slug}`}
                  className="premium-category-link"
                  aria-label={home.ui.accessibility.exploreCategory.replace(
                    '{category}',
                    category.name,
                  )}
                >
                  <AssistChip className="premium-category-chip">
                    <Icon slot="icon">category</Icon>
                    <span>{category.name}</span>
                    <Icon slot="trailing-icon"> arrow_forward </Icon>
                  </AssistChip>
                </NavLink>
              ))}
            </div>
            <sky-card variant="filled" className="home__premium-search-card">
              <form
                className="home__premium-search"
                role="search"
                aria-label={content.search.ariaLabel}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) { navigate(`/explore?q=${encodeURIComponent(searchQuery.trim())}`); }
                  else { navigate("/explore"); }
                  setShowSuggestions(false);
                }}
              >
                <TextButton type="button" className="home__premium-location" >
                  <span className="home__premium-location-content">
                    <Icon>location_on</Icon>
                    <span>{shortLocation ?? premiumHero.search.locationPlaceholder}</span>
                  </span>
                </TextButton>
                <OutlinedTextField
                  name="q"
                  label={premiumHero.search.servicePlaceholder}
                  className="premium-field premium-field--grow "
                  value={searchQuery}
                  onInput={(e) => {
                    const target = e.currentTarget as HTMLInputElement;
                    setSearchQuery(target.value);
                    setShowSuggestions(true);
                  }}
                >
                  <Icon slot="leading-icon">search</Icon>
                  {searchQuery && (
                    <Icon
                      slot="trailing-icon"
                      onClick={() => setSearchQuery("")}
                      style={{ cursor: "pointer" }}
                    > close </Icon>
                  )}
                </OutlinedTextField>
                <FilledButton type="submit">
                  {premiumHero.search.button}
                  <Icon slot="trailing-icon">arrow_forward</Icon>
                </FilledButton>
              </form>
              {showSuggestions && (
                <List className="search-suggestions">
                  {suggestions.length > 0 ? (
                    suggestions.map((deal) => (
                      <ListItem
                        key={deal.id}
                        type="button"
                        className="search-suggestion"
                        onClick={() => {
                          navigate(`/deal/${deal.id}`);
                          setSearchQuery("");
                          setShowSuggestions(false);
                        }}
                      >
                        <Icon slot="start">  search </Icon>
                        <div>
                          <strong>{deal.title}</strong>
                          <small>{deal.vendor?.businessName} • {deal.branch?.city} </small>
                        </div>
                      </ListItem>
                    ))
                  ) : (
                    <ListItem disabled> {content.search.emptySuggestion} </ListItem>
                  )}
                </List>
              )}
            </sky-card>
            <div className="home__premium-popular">
              {/* <span className="popular-label"> {home.ui.labels.popular}</span> */}

              {premiumHero.popular.map((item) => (
                <AssistChip
                  key={item}
                  className="premium-popular-chip"
                  onClick={() => {
                    navigate(`/explore?q=${encodeURIComponent(item)}`);
                  }}
                >
                  {item}
                </AssistChip>
              ))}
            </div>
          </div>
          <div className="home__premium-right">
            <div className="home__premium-image-card">
              <img src={premiumHero.image} alt={premiumHero.imageAlt} />
            </div>
          </div>
        </div>
      </section>
      {/* ── Hero / Search ──────────────────────────────────────────────── */}
      {false && (
        <section className="home__hero" aria-labelledby="hero-heading">
          <div className="home__hero-slider">
            {heroImages.map((image, index) => (
              <div key={index} className="home__hero-slide"
                style={{ backgroundImage: `url(${image})`, animationDelay: `${index * 6}s`, }}
              />
            ))}
          </div>
          <div className="home__hero-overlay"></div>
          <div className="home__hero-content">
            <h1 id="hero-heading" className="home__hero-heading"> {home.hero.heading}</h1>
            <p className="home__hero-sub">{home.hero.subheading}</p>
            <form
              className="home__hero-search"
              role="search"
              aria-label="Search deals"
              onSubmit={(e) => {
                e.preventDefault();
                const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value;
                if (q?.trim()) navigate(`/explore?q=${encodeURIComponent(q.trim())}`);
                else navigate('/explore');
              }}
            >
              <OutlinedTextField name="q" label={home.hero.searchPlaceholder} className="home__hero-search-field">
                <Icon slot="leading-icon" aria-hidden="true">search</Icon>
              </OutlinedTextField>
              <FilledButton type="submit">{home.hero.ctaLabel}</FilledButton>
            </form>
          </div>
        </section>
      )}
      {/* ── Browse by Category ─────────────────────────────────────────── */}
      <section className="home-section home-section--alt" aria-labelledby="category-heading">
        <div className="home-section__container">
          <SectionHeader
            id="category-heading"
            heading={home.sections.browseByCategory.heading}
            seeAll={home.sections.browseByCategory.seeAll}
            seeAllTo={home.sections.browseByCategory.seeAllTo}
          />
          <div className="home__category-grid">
            {(categories ?? []).map((cat) => (
              <NavLink
                key={cat.id}
                to={`/category/${cat.slug}`}
                className="category-card"
              >
                <div className="category-card__icon-wrap">
                  <Icon className="category-card__icon" aria-hidden="true">
                    category
                  </Icon>
                </div>

                <div className="category-card__content">
                  <h3>{cat.name}</h3>
                  <p>{categoryDealCount(cat.id)} {home.ui.labels.services}</p>
                </div>
                <div className="category-card__arrow">
                  <Icon>arrow_forward</Icon>
                </div>
              </NavLink>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Deals ─────────────────────────────────────────────── */}
      <section className="home-section" aria-labelledby="featured-heading">
        <div className="home-section__container">
          <SectionHeader
            id="featured-heading"
            heading={home.sections.featuredDeals.heading}
            seeAll={home.sections.featuredDeals.seeAll}
            seeAllTo={home.sections.featuredDeals.seeAllTo}
          />
          {renderDealCarousel(featuredDeals)}
        </div>
      </section>

      <section
        className="home-section home-section--alt"
        aria-label={home.ui.accessibility.memberPromotion}
      >
        <div className="home-section__container">
          <sky-card
            variant="filled"
            className="home__member-banner"
          >
            <div className="home__member-content">
              <div className="home__member-left">
                <FilledButton>
                  <Icon>{home.memberBanner.icon}</Icon>
                </FilledButton>
                <div className="home__member-text">
                  <h3>{home.memberBanner.heading}</h3>
                </div>
              </div>
              <FilledButton
                className="home__member-button"
                onClick={() => navigate(home.memberBanner.buttonLink)}
              >
                {home.memberBanner.button}
                <Icon slot="trailing-icon">
                  arrow_forward
                </Icon>
              </FilledButton>
            </div>
          </sky-card>
        </div>
      </section>

      {/* ── Hot Right Now ──────────────────────────────────────────────── */}
      <section className="home__heroo" aria-labelledby="hot-heading">
        <div className="home-section__container">
          <SectionHeader
            id="hot-heading"
            heading={home.sections.hotRightNow.heading}
            seeAll={home.sections.hotRightNow.seeAll}
            seeAllTo={home.sections.hotRightNow.seeAllTo}
          />
          <div className="home__hot-deals">

            <Tabs>
              {hotTabs.map((tab) => (
                <SecondaryTab
                  key={tab.value}
                  active={selectedTab === tab.value}
                  onClick={() => setSelectedTab(tab.value)}
                >
                  {tab.label}
                </SecondaryTab>
              ))}
            </Tabs>

            {renderDealCarousel(filteredHotDeals)}

          </div>
        </div>
      </section>

      {/* ── Gift Cards CTA ─────────────────────────────────────────────── */}
      <section
        className="home-section home-section--alt"
        aria-label={home.ui.accessibility.giftCardsPromotion}
      >
        <div className="home-section__container">

          <sky-card
            variant="filled"
            className="home__gift-banner"
          >

            <div className="home__gift-banner-content">

              {/* Left Icon */}

              <FilledButton>
                <Icon>
                  card_giftcard
                </Icon>
              </FilledButton>


              {/* Text */}
              <div className="home__gift-banner-text">

                <h2>
                  {home.giftCard.heading}
                </h2>

                <p>
                  {home.giftCard.body}
                </p>

              </div>


              {/* CTA */}
              <FilledButton
                className="home__gift-banner-button"
                onClick={() => navigate('/gift-cards')}
              >
                {home.giftCard.cta}

                <Icon slot="trailing-icon">
                  arrow_forward
                </Icon>

              </FilledButton>


            </div>

          </sky-card>

        </div>
      </section>

      {/* ── Per-popular-category horizontal sections ──────────────────── */}
      {popularCategoryDeals[0] && popularCategoryDeals[0].deals.length > 0 && (
        <section className="home-section" aria-labelledby={`popular-category-${popularCategoryDeals[0].category.id}-heading`}>
          <div className="home-section__container">
            <SectionHeader
              id={`popular-category-${popularCategoryDeals[0].category.id}-heading`}
              heading={popularCategoryDeals[0].category.name}
              seeAll="See all"
              seeAllTo={`/category/${popularCategoryDeals[0].category.slug}`}
            />
            {renderDealCarousel(popularCategoryDeals[0].deals)}
          </div>
        </section>
      )}
      <section className="home-section">
        <div className="home-section__container">

          <div className="home-section__header">
            <h2 className="home-section__heading">
              {home.vacationStays.title}
            </h2>
          </div>

          <div className="vacation-slider">

            <swiper-container
              ref={vacationSwiperRef}
              navigation="true"
              pagination="false"
              slides-per-view="auto"
              space-between="20"
              grab-cursor="true"
            >
              {home.vacationStays.items.map((item) => (
                <swiper-slide
                  key={item.label}
                  className="home-stays-slide"
                >
                  <sky-image-card
                    image={item.image}
                    imageAlt={item.imageAlt}
                    label={item.label}
                    href={item.href}
                  />
                </swiper-slide>
              ))}
            </swiper-container>

          </div>

        </div>
      </section>
      {popularCategoryDeals.slice(1).map(({ category, deals }, index) =>
        deals.length > 0 ? (
          <section
            key={category.id}
            className={index % 2 === 0 ? 'home-section home-section--alt' : 'home-section'}
            aria-labelledby={`popular-category-${category.id}-heading`}
          >
            <div className="home-section__container">
              <SectionHeader
                id={`popular-category-${category.id}-heading`}
                heading={category.name}
                seeAll="See all"
                seeAllTo={`/category/${category.slug}`}
              />
              {renderDealCarousel(deals)}
            </div>
          </section>
        ) : null,
      )}

      {/* ── Welcome Offer CTA ──────────────────────────────────────────── */}
      <section
        className="home-section home-section--alt"
        aria-label={home.ui.accessibility.welcomeOfferPromotion}
      >
        <div className="home-section__container">
          <sky-card
            variant="filled"
            className="home__offer-banner"
            style={{
              backgroundImage: `
         
          url(${home.welcomeOffer.image})
        `,
            }}
          >
            <div className="home__offer-content">
              <div className="home__offer-left">

                <span className="home__offer-badge">
                  {home.welcomeOffer.badge}
                </span>

                <h2 className="home__offer-title">
                  {home.welcomeOffer.title}
                </h2>

                <p className="home__offer-subtitle">
                  {home.welcomeOffer.subtitle}
                </p>

                <p className="home__offer-description">
                  {home.welcomeOffer.description}
                </p>

                <FilledButton onClick={() => navigate('/explore')}>
                  {home.welcomeOffer.cta}
                </FilledButton>

              </div>

              <div className="home__offer-right">
                <div className="offer-floating-card">
                  <span className="offer-discount">
                    {home.welcomeOffer.offerCard.discount}
                  </span>

                  <span className="offer-valid">
                    {home.welcomeOffer.offerCard.label}
                  </span>
                </div>
              </div>

            </div>
          </sky-card>
        </div>
      </section>

      <section
        className="home-section"
        aria-labelledby="search-destination-heading"
      >
        <div className="home-section__container">

          <h2
            id="search-destination-heading"
            className="home-section__heading"
          >
            {home.searchByDestination.heading}
          </h2>

          <p className="home__search-description">
            {home.searchByDestination.subheading}
          </p>

          <div className="home__search-grid">

            {home.searchByDestination.columns.map((column, columnIndex) => (

              <div
                key={columnIndex}
                className="home__search-column"
              >

                <sky-accordion>

                  {column.map((section) => (

                    <sky-accordion-item
                      key={section.title}
                      header={section.title}
                    >
                      <ul className="home__search-links">

                        {section.items.map((item) => (
                          <li key={item}>
                            {item}
                          </li>
                        ))}

                      </ul>
                    </sky-accordion-item>

                  ))}

                </sky-accordion>

              </div>

            ))}

          </div>

        </div>
      </section>

      <section className="home-section">
        <div className="home-section__container">
          <div className="home__trust-grid">
            {home.trustSection.cards.map((card, index) => (
              <sky-card
                key={index}
                variant="outlined"
                className="home__trust-card"
              >
                <div className="home__trust-top">

                  {card.type === 'logos' && card.logos && (
                    <div className="home__trust-icons">
                      {card.logos.map((logo) => (
                        <div key={logo} className="home__trust-circle">
                          <img
                            src={logo}
                            alt=""
                            className="home__trust-logo"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {card.type === "avatars" && card.avatars && (
                    <div className="home__trust-avatars">
                      {card.avatars.map((avatar) => (
                        <div key={avatar} className="home__trust-circle">
                          <img
                            src={avatar}
                            alt=""
                            className="home__trust-avatar"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {card.type === 'stars' && card.stars && (
                    <div className="home__trust-stars">
                      {Array.from({ length: card.stars }).map((_, i) => (
                        <Icon key={i}>
                          star
                        </Icon>
                      ))}
                    </div>
                  )}

                </div>

                <h3>{card.title}</h3>
                <p>{card.subtitle}</p>
              </sky-card>
            ))}
          </div>
        </div>
      </section>

      {/* /*FAQS*/}
      <section className="home-section home-section--alt" aria-labelledby="faq-heading">
        <div className="home-section__container">
          <div className="home__faq">
            <h2 id="faq-heading" className="home-section__heading" >
              {home.faq.heading}
            </h2>
            <p className="home__faq-subtitle">
              {home.faq.subheading}
            </p>
            <sky-accordion>
              {home.faq.items.map((item) => (
                <sky-accordion-item
                  key={item.question}
                  header={item.question}
                >
                  {item.answer}
                </sky-accordion-item>
              ))}
            </sky-accordion>
          </div>
        </div>
      </section>
    </div >
  );
}

export default Home;
