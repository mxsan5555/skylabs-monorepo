import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  FilledButton,
  Icon,
  OutlinedIconButton,
  SecondaryTab,
  Tabs,
} from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { formatINR } from '../../../utils/format';
import { signInPathWithReturnTo } from '../../../auth/role-routing';
import { useWishlist } from '../../../wishlist/wishlist-context';
import {
  listCatalogCategories,
  listCatalogDeals,
  listCatalogFaqs,
  listCatalogProducts,
  listCatalogTherapists,
  listCatalogPopularTreatments,
  type CatalogCategoryWithChildren,
  type CatalogDeal,
  type CatalogFaq,
  type CatalogProduct,
  type CatalogTherapist,
  type CatalogPopularTreatmentGroup,
} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { DealCard, type DealCardDeal } from '../../components/deal-card';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { primaryImage, resolveDealMedia, resolveTherapistMedia } from '../../../utils/media';
import { useCurrentLocation } from '../../../hooks/useCurrentLocation';
import content from '../../../content.json';
import './home.css';

const { home } = content;

/**
 * Adapts a real `CatalogDeal` into the shape `DealCard` renders. Real deals carry no
 * rating/reviews (no such fields exist on the real `Deal` model), so those stay `undefined`
 * rather than fabricated. `distance` is the real Haversine `distanceKm` computed server-side only
 * when the caller's coordinates were sent (see `useCurrentLocation`).
 */
function toDealCardDeal(deal: CatalogDeal): DealCardDeal {
  const salePrice = Number(deal.salePrice);
  const originalPrice = deal.originalPrice ? Number(deal.originalPrice) : undefined;
  const media = resolveDealMedia(deal);
  return {
    id: deal.id,
    title: deal.title,
    image: media.images[0] ?? '',
    imageAlt: deal.title,
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

function toProductCardDeal(product: CatalogProduct): DealCardDeal {
  const price = Number(product.price);
  const originalPrice = product.originalPrice != null ? Number(product.originalPrice) : undefined;
  return {
    id: product.id,
    title: product.name,
    image: product.image ?? '',
    imageAlt: product.imageAlt ?? product.name,
    providerName: product.vendor?.businessName ?? undefined,
    location: product.vendor?.city ?? undefined,
    price,
    originalPrice: originalPrice != null && originalPrice !== price ? originalPrice : undefined,
    discount: product.discount ?? undefined,
    priceNote: home.ui.labels.product,
    tag: product.popularTags?.[0]?.name,
  };
}

const CATEGORY_ICONS: Record<string, string> = {
  massage: 'self_improvement',
  'spa-retreats': 'hot_tub',
  'skin-beauty': 'face_retouching_natural',
  'hair-nails': 'content_cut',
  'health-wellness': 'favorite',
  therapy: 'healing',
  product: 'shopping_bag',
};

type SwiperHost = HTMLElement & { swiper?: { slidePrev(): void; slideNext(): void } };

/**
 * One horizontal card rail: heading + "See all" link + prev/next buttons in the header row,
 * so the arrows never sit on top of card content. `railKey` remounts the swiper when the
 * slide set is swapped wholesale (e.g. a tab change) so it starts from the first slide.
 */
function Rail({
  id,
  heading,
  seeAll,
  seeAllTo,
  railKey,
  above,
  children,
}: {
  id: string;
  heading: string;
  seeAll: string;
  seeAllTo: string;
  railKey?: string;
  above?: ReactNode;
  children: ReactNode;
}) {
  const swiperRef = useRef<SwiperHost>(null);
  return (
    <>
      <div className="home-head">
        <h2 id={id} className="home-head__title">{heading}</h2>
        <div className="home-head__actions">
          <Link className="home-head__link" to={seeAllTo}>
            {seeAll}
            <Icon aria-hidden="true">arrow_forward</Icon>
          </Link>
          <OutlinedIconButton
            className="home-head__nav"
            aria-label={`Previous ${heading}`}
            onClick={() => swiperRef.current?.swiper?.slidePrev()}
          >
            <Icon>chevron_left</Icon>
          </OutlinedIconButton>
          <OutlinedIconButton
            className="home-head__nav"
            aria-label={`Next ${heading}`}
            onClick={() => swiperRef.current?.swiper?.slideNext()}
          >
            <Icon>chevron_right</Icon>
          </OutlinedIconButton>
        </div>
      </div>
      {above}
      <div className="home-rail">
        <swiper-container key={railKey} ref={swiperRef} slides-per-view="auto" space-between={20} grab-cursor="true">
          {children}
        </swiper-container>
      </div>
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="home" role="status" aria-busy="true">
      <span className="sr-only">{home.ui.messages.loading}</span>
      <div className="home-container home-skeleton">
        <div className="home-skeleton__hero">
          <div className="home-skeleton__block home-skeleton__block--copy" />
          <div className="home-skeleton__block home-skeleton__block--media" />
        </div>
        <div className="home-skeleton__row">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="home-skeleton__block home-skeleton__block--card" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { toggle, has } = useWishlist();
  const { coords } = useCurrentLocation();
  const [selectedTab, setSelectedTab] = useState('all');
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const [dealsData, setDealsData] = useState<CatalogDeal[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<CatalogProduct[]>([]);
  const [therapists, setTherapists] = useState<CatalogTherapist[]>([]);
  const [faqs, setFaqs] = useState<CatalogFaq[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  // Single batched fetch; re-runs once real coordinates arrive so the page refreshes to
  // nearest-first data. Every section below derives from these arrays client-side, never a
  // per-section API call.
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError('');
    Promise.all([
      listCatalogCategories(),
      listCatalogDeals({ pageSize: 100, latitude: coords?.latitude, longitude: coords?.longitude }),
      listCatalogProducts({ pageSize: 12, sort: 'newest' }),
      listCatalogTherapists({ pageSize: 12, latitude: coords?.latitude, longitude: coords?.longitude }),
    ])
      .then(([categoriesRes, dealsRes, productsRes, therapistsRes]) => {
        if (cancelled) return;
        setCategories(categoriesRes.data ?? []);
        setDealsData(dealsRes.data ?? []);
        setFeaturedProducts(productsRes.data ?? []);
        setTherapists(therapistsRes.data ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalogError(err instanceof ApiRequestError ? err.message : home.ui.messages.loadError);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords?.latitude, coords?.longitude]);

  // FAQ is CMS-managed and non-critical: a failure just hides the section.
  useEffect(() => {
    listCatalogFaqs()
      .then(({ data }) => setFaqs(data ?? []))
      .catch(() => setFaqs([]));
  }, []);

  // Popular Treatments — Master-managed (see account/masters/popular-treatments.tsx); the
  // endpoint already returns only active groups holding only their own active treatments, so no
  // client-side filtering is needed here. Non-critical, same "failure just hides the section"
  // discipline as FAQ above.
  const [treatmentGroups, setTreatmentGroups] = useState<CatalogPopularTreatmentGroup[]>([]);
  useEffect(() => {
    listCatalogPopularTreatments()
      .then(({ data }) => setTreatmentGroups(data ?? []))
      .catch(() => setTreatmentGroups([]));
  }, []);

  // "Featured" = newest real deals (backend default sort); no `isFeatured` flag exists.
  const featuredDeals = useMemo(() => dealsData.slice(0, 12), [dealsData]);
  const hotDeals = useMemo(
    () => [...dealsData].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0)),
    [dealsData],
  );

  // A category is "popular" once it has at least one PopularTag, ordered by `sortOrder`.
  const popularCategories = useMemo(
    () =>
      [...categories]
        .filter((c) => (c.popularTags?.length ?? 0) > 0)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [categories],
  );
  const popularCategoryDeals = useMemo(
    () =>
      popularCategories.map((cat) => ({
        category: cat,
        deals: dealsData.filter((d) => d.category?.id === cat.id).slice(0, 6),
      })),
    [popularCategories, dealsData],
  );
  const hotTabs = useMemo(
    () => [
      { label: home.sections.hotRightNow.tabs[0]?.label ?? 'All Deals', value: 'all' },
      ...popularCategories.map((cat) => ({ label: cat.name, value: cat.id })),
    ],
    [popularCategories],
  );
  const filteredHotDeals = useMemo(
    () => (selectedTab === 'all' ? hotDeals : hotDeals.filter((d) => d.category?.id === selectedTab)),
    [selectedTab, hotDeals],
  );
  const dealCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dealsData) {
      if (d.category?.id) counts.set(d.category.id, (counts.get(d.category.id) ?? 0) + 1);
    }
    return counts;
  }, [dealsData]);

  function handleFavorite(id: string) {
    if (!isAuthenticated) {
      navigate(signInPathWithReturnTo(location));
      return;
    }
    toggle(id);
  }

  function dealSlides(deals: CatalogDeal[]) {
    return deals.map((deal) => (
      <swiper-slide key={deal.id} className="home-rail__slide">
        <DealCard
          deal={toDealCardDeal(deal)}
          eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
          favoriteActive={isAuthenticated && has(deal.id)}
          onFavorite={() => handleFavorite(deal.id)}
        />
      </swiper-slide>
    ));
  }

  if (catalogLoading) return <HomeSkeleton />;
  if (catalogError) {
    return <p className="error-state" role="alert">{catalogError}</p>;
  }

  const spotlight = hotDeals[0];
  const spotlightCard = spotlight ? toDealCardDeal(spotlight) : null;
  const [firstPopular, ...restPopular] = popularCategoryDeals.filter((p) => p.deals.length > 0);

  const popularSection = ({ category, deals }: (typeof popularCategoryDeals)[number], tint: boolean) => (
    <section
      key={category.id}
      className={`home-band${tint ? ' home-band--tint' : ''}`}
      aria-labelledby={`popular-category-${category.id}-heading`}
    >
      <div className="home-container">
        <Rail
          id={`popular-category-${category.id}-heading`}
          heading={category.name}
          seeAll={home.ui.labels.seeAll}
          seeAllTo={`/category/${category.slug}`}
        >
          {dealSlides(deals)}
        </Rail>
      </div>
    </section>
  );

  return (
    <div className="home">
      <title>{content.meta.home.title}</title>
      <meta name="description" content={content.meta.home.description} />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="home-hero" aria-labelledby="hero-heading">
        <div className="home-container home-hero__inner">
          <div className="home-hero__copy">
            <h1 id="hero-heading" className="home-hero__title">{home.hero.heading}</h1>
            <p className="home-hero__sub">{home.hero.subheading}</p>
            <sky-action-field
              className="home-hero__search"
              role="search"
              type="search"
              enterkeyhint="search"
              icon="search"
              label={home.hero.searchLabel}
              placeholder={home.hero.searchPlaceholder}
              actionLabel={home.hero.ctaLabel}
              onsky-submit={(e) => {
                const q = e.detail.value;
                navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
              }}
            />
          </div>

          <div className="home-hero__visual">
            <img
              className="home-hero__img"
              src={home.hero.image}
              alt={home.hero.imageAlt}
              width={1400}
              height={1050}
              fetchPriority="high"
            />
            {spotlight && spotlightCard && (
              <Link to={`/deal/${spotlight.id}`} className="home-spotlight">
                {spotlightCard.image && (
                  <img className="home-spotlight__thumb" src={spotlightCard.image} alt="" width={72} height={72} />
                )}
                <span className="home-spotlight__body">
                  <span className="home-spotlight__label">{home.hero.spotlightLabel}</span>
                  <span className="home-spotlight__title">{spotlightCard.title}</span>
                  <span className="home-spotlight__price">
                    <strong>{formatINR(spotlightCard.price)}</strong>
                    {spotlightCard.originalPrice && <s>{formatINR(spotlightCard.originalPrice)}</s>}
                    {spotlightCard.discount ? (
                      <span className="home-spotlight__off">-{spotlightCard.discount}%</span>
                    ) : null}
                  </span>
                </span>
                <Icon className="home-spotlight__arrow" aria-hidden="true">arrow_forward</Icon>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── Categories ─────────────────────────────────────────────────── */}
      <section className="home-band" aria-labelledby="category-heading">
        <div className="home-container">
          <div className="home-head">
            <h2 id="category-heading" className="home-head__title">{home.sections.browseByCategory.heading}</h2>
            <Link className="home-head__link" to={home.sections.browseByCategory.seeAllTo}>
              {home.sections.browseByCategory.seeAll}
              <Icon aria-hidden="true">arrow_forward</Icon>
            </Link>
          </div>
          <ul className="home-cats">
            {categories.map((cat) => (
              <li key={cat.id}>
                <sky-tile-card
                  icon={CATEGORY_ICONS[cat.slug] ?? 'spa'}
                  headline={cat.name}
                  text={`${dealCountByCategory.get(cat.id) ?? 0} ${home.ui.labels.services}`}
                  href={`/category/${cat.slug}`}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Featured deals ─────────────────────────────────────────────── */}
      {featuredDeals.length > 0 && (
        <section className="home-band home-band--tint" aria-labelledby="featured-heading">
          <div className="home-container">
            <Rail
              id="featured-heading"
              heading={home.sections.featuredDeals.heading}
              seeAll={home.sections.featuredDeals.seeAll}
              seeAllTo={home.sections.featuredDeals.seeAllTo}
            >
              {dealSlides(featuredDeals)}
            </Rail>
          </div>
        </section>
      )}

      {/* ── Offers bento ───────────────────────────────────────────────── */}
      <section className="home-band" aria-label={home.ui.accessibility.welcomeOfferPromotion}>
        <div className={`home-container home-offers${isAuthenticated ? ' home-offers--member' : ''}`}>
          <article className="home-offer home-offer--welcome">
            <img className="home-offer__bg" src={home.welcomeOffer.image} alt="" loading="lazy" />
            <div className="home-offer__content">
              <p className="home-offer__badge">{home.welcomeOffer.badge}</p>
              <h2 className="home-offer__title">{home.welcomeOffer.title}</h2>
              <p className="home-offer__subtitle">{home.welcomeOffer.subtitle}</p>
              <p className="home-offer__text">{home.welcomeOffer.description}</p>
              <FilledButton onClick={() => navigate('/explore')}>{home.welcomeOffer.cta}</FilledButton>
            </div>
          </article>

          <sky-feature-card
            className="home-offer--gift"
            color="primary"
            icon="card_giftcard"
            iconStyle="surface"
            headline={home.giftCard.heading}
            text={home.giftCard.body}
            ctaLabel={home.giftCard.cta}
            ctaHref="/gift-cards"
          />

          {!isAuthenticated && (
            <sky-feature-card
              color="surface-high"
              icon={home.memberBanner.icon}
              iconStyle="surface"
              headline={home.memberBanner.heading}
              text={home.memberBanner.body}
              ctaLabel={home.memberBanner.button}
              ctaHref={home.memberBanner.buttonLink}
            />
          )}
        </div>
      </section>

      {/* ── Biggest savings (tabbed by popular category) ───────────────── */}
      <section className="home-band home-band--tint" aria-labelledby="hot-heading">
        <div className="home-container">
          <Rail
            id="hot-heading"
            heading={home.sections.hotRightNow.heading}
            seeAll={home.sections.hotRightNow.seeAll}
            seeAllTo={home.sections.hotRightNow.seeAllTo}
            railKey={selectedTab}
            above={
              hotTabs.length > 1 ? (
                <Tabs className="home-tabs">
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
              ) : null
            }
          >
            {dealSlides(filteredHotDeals)}
          </Rail>
          {filteredHotDeals.length === 0 && <p className="home-empty">{home.ui.messages.noResults}</p>}
        </div>
      </section>

      {firstPopular && popularSection(firstPopular, false)}

      {/* ── Therapists ─────────────────────────────────────────────────── */}
      {therapists.length > 0 && (
        <section className="home-band" aria-labelledby="therapists-heading">
          <div className="home-container">
            <Rail
              id="therapists-heading"
              heading={home.sections.therapists.heading}
              seeAll={home.sections.therapists.seeAll}
              seeAllTo={home.sections.therapists.seeAllTo}
            >
              {therapists.map((therapist) => {
                const price = therapist.packages.length
                  ? Math.min(...therapist.packages.map((p) => Number(p.sellingPrice)))
                  : null;
                return (
                  <swiper-slide key={therapist.id} className="home-rail__slide">
                    <SkyProductCardWC
                      image={primaryImage(resolveTherapistMedia(therapist))}
                      imageAlt={therapist.personName}
                      eyebrow={therapist.personName}
                      eyebrowHref={therapist.vendor?.slug ? `/vendor/${therapist.vendor.slug}` : undefined}
                      heading={therapist.therapistType}
                      location={therapist.branch?.city ?? undefined}
                      distance={
                        therapist.distanceKm != null ? `${Math.round(therapist.distanceKm * 10) / 10} km` : undefined
                      }
                      tag={therapist.popularTags?.[0]?.name}
                      pricePrefix={price != null ? home.ui.labels.from : undefined}
                      price={price != null ? formatINR(price) : undefined}
                      href={`/therapist/${therapist.id}`}
                    />
                  </swiper-slide>
                );
              })}
            </Rail>
          </div>
        </section>
      )}

      {/* ── Products ───────────────────────────────────────────────────── */}
      {featuredProducts.length > 0 && (
        <section className="home-band home-band--tint" aria-labelledby="featured-products-heading">
          <div className="home-container">
            <Rail
              id="featured-products-heading"
              heading={home.sections.featuredProducts.heading}
              seeAll={home.sections.featuredProducts.seeAll}
              seeAllTo={home.sections.featuredProducts.seeAllTo}
            >
              {featuredProducts.map((product) => (
                <swiper-slide key={product.id} className="home-rail__slide">
                  <DealCard
                    deal={toProductCardDeal(product)}
                    href={`/products/${product.id}`}
                    favoriteActive={isAuthenticated && has(product.id)}
                    onFavorite={() => handleFavorite(product.id)}
                  />
                </swiper-slide>
              ))}
            </Rail>
          </div>
        </section>
      )}

      {restPopular.map((p, i) => popularSection(p, i % 2 === 1))}

      {/* ── Partner CTA ────────────────────────────────────────────────── */}
      <section className="home-band home-band--flush" aria-label={home.partnerBanner.heading}>
        <div className="home-container">
          <sky-cta-banner
            color="inverse"
            icon={home.partnerBanner.icon}
            iconStyle="tonal"
            iconShape="full"
            headline={home.partnerBanner.heading}
            text={home.partnerBanner.body}
            ctaLabel={home.partnerBanner.cta}
            ctaHref={home.partnerBanner.href}
            ctaIcon="arrow_forward"
          />
        </div>
      </section>

      {/* ── Treatment directory (Master-managed — see account/masters/popular-treatments.tsx) ── */}
      {treatmentGroups.length > 0 && (
        <section className="home-band" aria-labelledby="treatments-heading">
          <div className="home-container">
            <div className="home-head home-head--stack">
              <h2 id="treatments-heading" className="home-head__title">{home.searchByDestination.heading}</h2>
              <p className="home-head__sub">{home.searchByDestination.subheading}</p>
            </div>
            <div className="home-directory">
              {treatmentGroups.map((group) => (
                <div key={group.id} className="home-directory__group">
                  <h3 className="home-directory__title">{group.name}</h3>
                  <ul className="home-directory__links">
                    {group.treatments.map((treatment) => {
                      const params = new URLSearchParams({ q: treatment.name });
                      if (treatment.categorySlug) params.set('category', treatment.categorySlug);
                      return (
                        <li key={treatment.id}>
                          <Link to={`/explore?${params.toString()}`}>{treatment.name}</Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      {faqs.length > 0 && (
        <section className="home-band home-band--tint" aria-labelledby="faq-heading">
          <div className="home-container home-faq">
            <div className="home-faq__intro">
              <h2 id="faq-heading" className="home-head__title">{home.faq.heading}</h2>
              <p className="home-head__sub">{home.faq.subheading}</p>
            </div>
            <sky-accordion single>
              {faqs.map((item) => (
                <sky-accordion-item key={item.id} header={item.question}>
                  {item.answer}
                </sky-accordion-item>
              ))}
            </sky-accordion>
          </div>
        </section>
      )}
    </div>
  );
}

export default Home;
