import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, OutlinedButton, OutlinedIconButton } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { addCartItem } from '../../../api/cart';
import { getCatalogDeal, listCatalogDeals, type CatalogDeal, type CatalogDealDetail } from '../../../api/catalog';
import { resolveMediaUrl } from '../../../api/media';
import { ApiRequestError } from '../../../api/rbac/client';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useRequireSignIn } from '../../../hooks/use-require-sign-in';
import { useHydrated } from '../../../hooks/use-hydrated';
import { showCartAdded } from '../../../hooks/use-add-product-to-cart';
import { useDealPurchaseSelection } from '../../../hooks/use-deal-purchase-selection';
import { OfferCard } from '../../components/offer-card/offer-card';
import { TherapistCard } from '../../components/therapist-card/therapist-card';
import { CardRail } from '../../components/card-rail/card-rail';
import { Breadcrumb } from '../../components/breadcrumb';
import { PageSection } from '../../components/page-section/page-section';
import { DurationPackageSelector } from '../../components/duration-package-selector';
import { BranchPanels, DetailGallery, DetailNotFound, DetailPrice, DetailPurchase, discountPercent } from '../../components/detail-page/detail-page';
import { BannerSlot } from '../../components/banner-slot/banner-slot';
import { Seo } from '../../seo/seo';
import { absoluteUrl } from '../../seo/site-url';
import { usePrerenderedData, dealDataKey } from '../../../prerender-data/prerender-data';
import { categoryHref, cityHref, citySlug } from '../../../catalog/catalog-shell';
import { fillTemplate } from '../../../utils/format';
import { resolveDealMedia } from '../../../utils/media';
import { htmlToPlainText } from '../../../utils/rich-text';
import { dealPath } from '../../seo/public-urls';
import { absoluteUrl } from '../../seo/site-url';
import content from '../../../content.json';

const t = content.dealDetail;
const d = content.detailPage;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** "Ends in" shows within this many days of the sale end (PLANNING §2.7). */
const ENDS_IN_DAYS = 7;
/** "Only {n} left" from this stock down. */
const LOW_STOCK = 10;
const COUNTDOWN_TICK_MS = 60_000;
const TITLE_MAX = 60;
const META_MAX = 155;

/** "Ends in 2d 5h" within 7 days of the sale end; null otherwise (and before hydration). */
function endsInLabel(endDate: string | null, now: number): string | null {
  if (!endDate) return null;
  const left = new Date(endDate).getTime() - now;
  if (!(left > 0) || left > ENDS_IN_DAYS * DAY_MS) return null;
  const days = Math.floor(left / DAY_MS);
  const hours = Math.max(1, Math.floor((left % DAY_MS) / HOUR_MS));
  return days > 0
    ? fillTemplate(t.availability.endsInDays, { days: String(days), hours: String(hours) })
    : fillTemplate(t.availability.endsInHours, { hours: String(hours) });
}

/** "{Title} at {Member}, {City}", trimmed from the title so the member and city stay (PLANNING §2.7). */
function pageTitle(deal: CatalogDealDetail): string {
  const member = deal.vendor?.businessName;
  const city = deal.branch?.city;
  if (!member) return deal.title;
  const build = (title: string) => fillTemplate(city ? t.meta.titleTemplate : t.meta.titleTemplateNoCity, { title, member, city: city ?? '' });
  const full = build(deal.title);
  if (full.length <= TITLE_MAX) return full;
  const room = Math.max(10, deal.title.length - (full.length - TITLE_MAX) - 1);
  const cut = deal.title.slice(0, room);
  // End on a whole word ("Premium Nail…", not "Premium Nail Extensio…") unless that drops most of it.
  const lastSpace = cut.lastIndexOf(' ');
  return build(`${(lastSpace >= room / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`);
}

function metaDescription(deal: CatalogDealDetail): string {
  const text = (deal.tagline || deal.description || fillTemplate(t.meta.defaultDescription, { name: deal.title })).replace(/\s+/g, ' ').trim();
  return text.length <= META_MAX ? text : `${text.slice(0, META_MAX - 1).trimEnd()}…`;
}

const SCHEMA_DAYS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Service + AggregateOffer, BreadcrumbList and FAQPage (no rating markup until reviews exist). */
function dealJsonLd(deal: CatalogDealDetail, images: string[], crumbs: { label: string; to?: string }[]) {
  const prices = deal.packages.map((p) => Number(p.sellingPrice));
  const branch = deal.branch;
  const hours = branch?.openingHours
    ? Object.entries(branch.openingHours).flatMap(([day, h]) =>
        h?.open && h.start && h.end ? [{ '@type': 'OpeningHoursSpecification', dayOfWeek: SCHEMA_DAYS[day], opens: h.start, closes: h.end }] : [],
      )
    : [];
  const provider = deal.vendor?.businessName
    ? {
        '@type': 'LocalBusiness',
        name: deal.vendor.businessName,
        ...(deal.vendor.slug ? { url: absoluteUrl(`/vendor/${deal.vendor.slug}`) } : {}),
        ...(branch
          ? {
              address: {
                '@type': 'PostalAddress',
                streetAddress: [branch.address, branch.addressLine2].filter(Boolean).join(', ') || undefined,
                addressLocality: branch.city ?? undefined,
                addressRegion: branch.state ?? undefined,
                postalCode: branch.pincode ?? undefined,
                addressCountry: 'IN',
              },
              ...(branch.phone ? { telephone: branch.phone } : {}),
              ...(branch.latitude && branch.longitude
                ? { geo: { '@type': 'GeoCoordinates', latitude: Number(branch.latitude), longitude: Number(branch.longitude) } }
                : {}),
              ...(hours.length ? { openingHoursSpecification: hours } : {}),
            }
          : {}),
      }
    : undefined;
  const service = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: deal.title,
    description: metaDescription(deal),
    url: absoluteUrl(`/deal/${deal.slug}`),
    ...(images.length ? { image: images } : {}),
    ...(deal.category ? { serviceType: deal.category.name } : {}),
    ...(branch?.city ? { areaServed: { '@type': 'City', name: branch.city } } : {}),
    ...(provider ? { provider } : {}),
    ...(prices.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: deal.currency,
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: prices.length,
            availability: deal.isSoldOut ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
            ...(deal.endDate ? { validThrough: deal.endDate } : {}),
          },
        }
      : {}),
  };
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.to ? { item: absoluteUrl(c.to) } : {}),
    })),
  };
  const faq = deal.faqs.length
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: deal.faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
        },
      ]
    : [];
  return [service, breadcrumbs, ...faq];
}

/**
 * The deal page (`/deal/:slug`, docs/msd/PLANNING.md §2.7): gallery, buy box (tagline,
 * highlights, packages, quantity within stock and the per-customer limit), What you get, How to
 * redeem, Cancellation and Fine print, the deal's therapists, location and hours, About the
 * business, questions, then more deals from the category. Opens by slug, an old slug or the
 * UUID; the address bar and canonical always show the current slug. Prerendered pages carry the
 * deal in the embedded payload.
 */
export function DealDetail() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const hydrated = useHydrated();
  const requireSignIn = useRequireSignIn();
  const { has: isWishlisted, toggle: toggleWishlist, isPending: wishlistPending } = useWishlist();
  const seeded = usePrerenderedData<{ deal: CatalogDealDetail | null }>(dealDataKey(slug));
  const [deal, setDeal] = useState<CatalogDealDetail | null>(seeded?.deal ?? null);
  const [loading, setLoading] = useState(!seeded);
  const [error, setError] = useState('');
  const [related, setRelated] = useState<CatalogDeal[]>([]);
  const [actionError, setActionError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (seeded?.deal && seeded.deal.slug === slug) return;
    if (!slug) {
      setDeal(null);
      setError(t.errors.invalidDeal);
      setLoading(false);
      return;
    }
   
    setLoading(true);
    setError('');
    getCatalogDeal(slug)
      .then(({ data }) => {
        if (cancelled) return;
        setDeal(data);
        // An old slug or the UUID: show the current address (the canonical carries it too).
        if (data.slug && data.slug !== slug) navigate(`/deal/${data.slug}`, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 404) setDeal(null);
        else setError(err instanceof ApiRequestError ? err.message : t.errors.loadDeal);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `seeded` is read once for the first render
  }, [slug, navigate]);

  // Countdown: client only, refreshed every minute.
  useEffect(() => {
    if (!hydrated) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  const categoryId = deal?.category?.id;
  const dealId = deal?.id;
  const city = deal?.branch?.city ?? undefined;
  useEffect(() => {
    if (!categoryId) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    listCatalogDeals({ categoryId, pageSize: 7, ...(city ? { city } : {}) })
      .then(({ data }) => {
        if (!cancelled) setRelated(data.filter((item) => item.id !== dealId).slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, dealId, city]);

  const purchaseSelection = useDealPurchaseSelection(deal);

  if (loading) return <p className="loading-state" role="status">{t.loading}</p>;
  if (error || !deal) return <DetailNotFound copy={t.notFound} to="/deals" />;

  const media = resolveDealMedia(deal);
  const alts = (deal.mediaImages ?? []).map((m) => m.altText);
  const activePackage = deal.packages.find((p) => p.id === purchaseSelection.activePackage?.id) ?? deal.packages[0];
  const salePrice = purchaseSelection.unitPrice;
  const originalPrice = activePackage?.originalPrice != null ? Number(activePackage.originalPrice) : undefined;
  // From the selected package, never the deal's cached "from" discount.
  const discountPct = activePackage?.discountPercent ?? discountPercent(salePrice, originalPrice);
  const saved = isWishlisted(deal.id);
  const caps = [deal.stockLeft, deal.limitPerCustomer].filter((n): n is number => n != null && n > 0);
  const maxQuantity = caps.length ? Math.min(...caps) : undefined;
  const endsIn = hydrated && now ? endsInLabel(deal.endDate, now) : null;
  const chipCategory = deal.subcategory ?? deal.category;

  const crumbs = [
    { label: content.categories.breadcrumb.home, to: '/' },
    ...(city ? [{ label: fillTemplate(t.breadcrumbCity, { city }), to: `/deals/${citySlug(city)}` }] : []),
    ...(deal.category ? [{ label: deal.category.name, to: city ? cityHref(deal.category.slug, city) : categoryHref(deal.category.slug) }] : []),
    { label: deal.title },
  ];

  const handleAddToCart = async () => {
    if (!requireSignIn()) return;
    if (!purchaseSelection.activePackage) {
      setActionError(purchaseSelection.missingSelection ?? d.selectDuration);
      return;
    }
    setActionError('');
    try {
      await addCartItem(token, { dealId: deal.id, dealPackageId: purchaseSelection.activePackage.id, quantity });
      showCartAdded(deal.title, () => navigate('/cart'));
    } catch (err) {
      // 409 DEAL_LIMIT_REACHED / DEAL_SOLD_OUT carry their own message.
      setActionError(err instanceof ApiRequestError ? err.message : t.errors.addToCart);
    }
  };

  const notes = [
    deal.boughtCount != null && { icon: 'local_fire_department', text: fillTemplate(t.availability.bought, { count: String(deal.boughtCount) }) },
    endsIn && { icon: 'schedule', text: endsIn },
    !deal.isSoldOut && deal.stockLeft != null && deal.stockLeft <= LOW_STOCK && { icon: 'inventory_2', text: fillTemplate(t.availability.stockLeft, { count: String(deal.stockLeft) }) },
    deal.limitPerCustomer != null && { icon: 'person', text: fillTemplate(t.availability.limit, { limit: String(deal.limitPerCustomer) }) },
  ].filter((n): n is { icon: string; text: string } => Boolean(n));

  const validity =
    deal.validityDays != null
      ? deal.validityDays === 1
        ? t.redeem.validForOne
        : fillTemplate(t.redeem.validFor, { days: String(deal.validityDays) })
      : null;
  const logo = deal.vendor?.mediaImages?.[0]?.storageKey ? resolveMediaUrl(deal.vendor.mediaImages[0].storageKey) : deal.vendor?.logoUrl;

  return (
    <>
      <Seo
        title={pageTitle(deal)}
        description={metaDescription(deal)}
        path={`/deal/${deal.slug}`}
        image={media.images[0]}
        jsonLd={dealJsonLd(deal, media.images, crumbs)}
      />

      {/* Hero: gallery (70) + buy box (30) */}
      <PageSection stack aria-labelledby="detail-title">
        <Breadcrumb items={crumbs} />
        <div className="detail-page__grid">
          <DetailGallery images={media.images} alts={alts} video={media.video} alt={deal.title} discountPct={discountPct ?? 0} />
          <div className="detail-page__buy">
            <div className="detail-page__chips">
              {chipCategory && <sky-badge variant="secondary" size="small">{chipCategory.name}</sky-badge>}
              {deal.vendor?.businessName &&
                (deal.vendor.slug ? (
                  <Link to={`/vendor/${deal.vendor.slug}`}>
                    <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
                  </Link>
                ) : (
                  <sky-badge variant="primary" size="small">{deal.vendor.businessName}</sky-badge>
                ))}
              {city && <sky-badge variant="secondary" size="small">{city}</sky-badge>}
            </div>
            <h1 id="detail-title" className="detail-page__title headline-medium">{deal.title}</h1>
            {deal.tagline && <p className="detail-page__tagline body-large">{deal.tagline}</p>}
            {deal.highlights.length > 0 && (
              <ul className="detail-page__highlights body-medium" aria-label={t.highlights}>
                {deal.highlights.map((h) => (
                  <li key={h}>
                    <Icon aria-hidden="true">check_circle</Icon>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            )}
            <DetailPrice price={salePrice} originalPrice={originalPrice} discountPct={discountPct ?? 0} />
            <DurationPackageSelector selection={purchaseSelection} />
            <DetailPurchase
              unitPrice={salePrice}
              quantity={quantity}
              onQuantityChange={(q) => setQuantity(maxQuantity ? Math.min(q, maxQuantity) : q)}
              onAdd={() => void handleAddToCart()}
              addDisabled={!!purchaseSelection.missingSelection}
              maxQuantity={maxQuantity}
              soldOut={deal.isSoldOut}
              error={actionError}
              actions={
                <OutlinedIconButton
                  aria-label={saved ? t.wishlist.remove : t.wishlist.save}
                  aria-pressed={saved}
                  disabled={wishlistPending(deal.id)}
                  onClick={() => {
                    if (requireSignIn()) void toggleWishlist(deal.id);
                  }}
                >
                  <Icon aria-hidden="true">{saved ? 'favorite' : 'favorite_border'}</Icon>
                </OutlinedIconButton>
              }
              notes={
                notes.length > 0 ? (
                  <ul className="detail-page__notes body-small">
                    {notes.map((n) => (
                      <li key={n.text}>
                        <Icon aria-hidden="true">{n.icon}</Icon>
                        {n.text}
                      </li>
                    ))}
                  </ul>
                ) : undefined
              }
            />
          </div>
        </div>
      </PageSection>

      {/* Details (70) + location and hours (30) */}
      <PageSection tone="tint" aria-labelledby="detail-details-heading">
        <div className="detail-page__grid">
          <div className="detail-page__content">
            <h2 id="detail-details-heading" className="detail-page__heading title-large">{d.details}</h2>
            <sky-accordion>
              {deal.description && (
                <sky-accordion-item header={t.sections.whatYouGet} level={3} open>
                  <p className="detail-page__text body-large">{deal.description}</p>
                </sky-accordion-item>
              )}
              <sky-accordion-item header={t.sections.howToRedeem} level={3}>
                <p className="detail-page__text body-medium">{deal.bookingRequired ? t.redeem.bookingRequired : t.redeem.walkIn}</p>
                {deal.bookingInstructions && <p className="detail-page__text body-medium">{deal.bookingInstructions}</p>}
                {validity && <p className="detail-page__text body-medium">{validity}</p>}
              </sky-accordion-item>
              <sky-accordion-item header={t.sections.cancellation} level={3}>
                <p className="detail-page__text body-medium">{t.cancellation[deal.cancellationPolicy] ?? t.cancellation.FREE_24H}</p>
                {deal.cancellationNote && <p className="detail-page__text body-medium">{deal.cancellationNote}</p>}
              </sky-accordion-item>
              <sky-accordion-item header={t.sections.finePrint} level={3}>
                {deal.eligibility.length > 0 && (
                  <>
                    <h4 className="title-small">{t.sections.eligibility}</h4>
                    <ul className="detail-page__chip-list">
                      {deal.eligibility.map((e) => (
                        <li key={e}>
                          <sky-badge variant="secondary" size="small">{e}</sky-badge>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {deal.termsAndConditions && <p className="detail-page__text body-medium">{deal.termsAndConditions}</p>}
                <p className="body-medium">
                  <Link to="/terms">{t.termsLink}</Link>
                </p>
              </sky-accordion-item>
            </sky-accordion>
          </div>
          {deal.branch && <BranchPanels branch={deal.branch} vendorSlug={deal.vendor?.slug} showMap />}
        </div>
      </PageSection>

      {deal.therapists.length > 0 && (
        <PageSection aria-labelledby="deal-therapists-heading">
          <CardRail id="deal-therapists-heading" heading={t.sections.therapists}>
            {deal.therapists.map((therapist) => (
              <swiper-slide key={therapist.id} className="card-rail__slide">
                <TherapistCard therapist={therapist} variant="outlined" />
              </swiper-slide>
            ))}
          </CardRail>
        </PageSection>
      )}

      {deal.vendor?.businessName && (
        <PageSection tone="tint" aria-labelledby="deal-about-heading">
          <div className="detail-page__about">
            {logo && <img className="detail-page__about-logo" src={logo} alt="" width={64} height={64} loading="lazy" />}
            <div className="detail-page__about-body">
              <h2 id="deal-about-heading" className="detail-page__heading title-large">
                {fillTemplate(t.sections.about, { name: deal.vendor.businessName })}
              </h2>
              {deal.vendor.businessDescription && <p className="detail-page__text body-medium">{deal.vendor.businessDescription}</p>}
              <div className="detail-page__panel-actions">
                {deal.vendor.slug && (
                  <OutlinedButton href={`/vendor/${deal.vendor.slug}`}>
                    <Icon slot="icon" aria-hidden="true">storefront</Icon>
                    {fillTemplate(t.about.allDeals, { name: deal.vendor.businessName })}
                  </OutlinedButton>
                )}
                {deal.vendor.website && (
                  <OutlinedButton href={deal.vendor.website} target="_blank" rel="noopener noreferrer">
                    <Icon slot="icon" aria-hidden="true">language</Icon>
                    {t.about.website}
                  </OutlinedButton>
                )}
              </div>
            </div>
          </div>
        </PageSection>
      )}

      {deal.faqs.length > 0 && (
        <PageSection aria-labelledby="deal-faq-heading">
          <h2 id="deal-faq-heading" className="detail-page__heading title-large">{t.sections.faqs}</h2>
          <sky-accordion single>
            {deal.faqs.map((faq) => (
              <sky-accordion-item key={faq.id} header={faq.question} level={3}>
                <p className="detail-page__text body-medium">{faq.answer}</p>
              </sky-accordion-item>
            ))}
          </sky-accordion>
        </PageSection>
      )}

      {related.length > 0 && (
        <PageSection aria-labelledby="related-heading">
          <CardRail
            id="related-heading"
            heading={deal.category ? fillTemplate(t.sections.related, { category: deal.category.name }) : d.related}
          >
            {related.map((item) => (
              <swiper-slide key={item.id} className="card-rail__slide">
                <OfferCard slider item={{ type: 'deal', deal: item }} variant="outlined" layout="vertical" />
              </swiper-slide>
            ))}
          </CardRail>
        </PageSection>
      )}
      <BannerSlot slot="DEAL_BOTTOM" />
    </>
  );
}
export default DealDetail;
