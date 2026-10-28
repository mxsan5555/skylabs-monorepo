import { useMemo, type ReactNode } from 'react';
import '@skylabs-monorepo/shared-ui/carousel';
import { OfferCard, type OfferTag,} from '../../components/offer-card/offer-card';
import { primaryImage, resolveDealMedia } from '../../../utils/media';
import { CardRail } from '../../components/card-rail/card-rail';
import { TherapistCard } from '../../components/therapist-card/therapist-card';
import { PageSection } from '../../components/page-section/page-section';
import { Seo } from '../../seo/seo';
import { faqPageJsonLd, itemListJsonLd, type JsonLdObject } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import { CategoryTiles } from './category-tiles';
import { DealsNearYou } from './deals-near-you';
import { HomeHero } from './home-hero';
import { BannerSlot } from '../../components/banner-slot/banner-slot';
import { HowItWorks } from './how-it-works';
import { TreatmentDirectory } from './treatment-directory';
import { HOME_RAIL_SIZE, useHomeCatalog, } from './home-data';
import content from '../../../content.json';
import './home.css';
import { dealHref, useCatalogShell } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import type { CatalogDeal } from '../../../api/catalog';
const { home } = content;
const HOME_DEAL_TAGS: Record<'new' | 'hot' | 'expirySoon', OfferTag> = {
  new: {
    label: 'New',
    color: 'tertiary',
    tone: 'tonal',
  },
  hot: {
    label: 'Hot',
    color: 'error',
  },
  expirySoon: {
    label: 'Expire soon',
    color: 'error',
    tone: 'tonal',
  },
};
export function Home() {
  const { categories } = useCatalogShell();
  const { status: locationStatus, coords } = useVisitorLocation();
  const catalog = useHomeCatalog(locationStatus === 'locating' ? undefined : coords);
  const ready = catalog.status === 'ready';
  const spotlight = useMemo(
    () => [...catalog.deals].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))[0], [catalog.deals],);
  const jsonLd = useMemo(() => {
    const blocks: JsonLdObject[] = [];
    if (SITE_URL && catalog.deals.length > 0) {
      blocks.push(
        itemListJsonLd(
          SITE_URL,
          catalog.deals
            .slice(0, HOME_RAIL_SIZE)
            .map((d) => ({
              name: d.title,
              path: dealHref(d),
              price: Number(d.salePrice),
              image: primaryImage(resolveDealMedia(d)) || undefined,
            })),
        ),
      );
    }
    if (catalog.faqs.length > 0) blocks.push(faqPageJsonLd(catalog.faqs));
    return blocks.length > 0 ? blocks : undefined;
  }, [catalog.deals, catalog.faqs]);
 const renderDeal = (
  deal: CatalogDeal,
  tag?: OfferTag,
): ReactNode => (
  <swiper-slide key={deal.id} className="card-rail__slide">
    <OfferCard
      slider
      item={{ type: 'deal', deal }}
      {...(tag ? { tag } : {})}
      variant="outlined"
      layout="vertical"
    />
  </swiper-slide>
);
  // tag wise sections
const renderDealSection = (
  id: string,
  heading: string,
  seeAllTo: string,
  tag: OfferTag,
  tone: 'tint' | 'surface' = 'surface',
) => (
  <PageSection tone={tone} aria-labelledby={id}>
    <CardRail
      id={id}
      heading={heading}
      seeAll="See All Deals"
      seeAllTo={seeAllTo}
    >
      {catalog.deals
        .slice(0, HOME_RAIL_SIZE)
        .map((deal) => renderDeal(deal, tag))}
    </CardRail>
  </PageSection>
);
  return (
    <div className="home">
      <Seo title={content.meta.home.title} description={content.meta.home.description} path="/" jsonLd={jsonLd} />
      <HomeHero spotlight={ready ? spotlight : undefined} />
      <CategoryTiles categories={categories} />
      <DealsNearYou
        status={catalog.status}
        error={catalog.error}
        deals={catalog.deals}
        categories={categories}
        renderDeal={renderDeal}
      />
      {/* tagwise sections */}
      {ready && catalog.deals.length > 0 && (
        <>
     {renderDealSection(
  'new-heading',
  'New Arrivals',
  '/deals?tag=new',
  HOME_DEAL_TAGS.new,
  'surface',
)}

{renderDealSection(
  'hot-heading',
  '	Trending Deals',
  '/deals?tag=hot',
  HOME_DEAL_TAGS.hot,
  'tint',
)}

{renderDealSection(
  'expiry-soon-heading',
  'Ending Soon',
  '/deals?tag=expiry-soon',
  HOME_DEAL_TAGS.expirySoon,
  'surface',
)}  </>
      )}
      <HowItWorks />
      {ready && catalog.therapists.length > 0 && (
        <PageSection tone="tint" aria-labelledby="therapists-heading">
          <CardRail
            id="therapists-heading"
            heading={home.sections.therapists.heading}
            seeAll={home.sections.therapists.seeAll}
            seeAllTo={home.sections.therapists.seeAllTo}
          >
            {catalog.therapists.map((therapist) => (
              <swiper-slide key={therapist.id} className="card-rail__slide">
                <TherapistCard therapist={therapist} />
              </swiper-slide>
            ))}
          </CardRail>
        </PageSection>
      )}
      <BannerSlot slot="HOME_AFTER_DEALS" />
      {ready && catalog.products.length > 0 && (
        <PageSection tone="tint" aria-labelledby="products-heading">
          <CardRail
            id="products-heading"
            heading={home.sections.featuredProducts.heading}
            seeAll={home.sections.featuredProducts.seeAll}
            seeAllTo={home.sections.featuredProducts.seeAllTo}
          >
            {catalog.products.map((product) => (
              <swiper-slide key={product.id} className="card-rail__slide">
                <OfferCard slider
                  item={{ type: 'product', product }}
                  variant="outlined"
                  layout="vertical"
                />
              </swiper-slide>
            ))}
          </CardRail>
        </PageSection>
      )}
      <BannerSlot slot="HOME_AFTER_PRODUCTS" />
      <TreatmentDirectory groups={catalog.popularTreatments} />
      <PageSection flush aria-labelledby="partner-heading">
        <sky-cta-banner
          color="inverse"
          icon={home.partnerBanner.icon}
          icon-style="tonal"
          icon-shape="full"
          cta-label={home.partnerBanner.cta}
          cta-href={home.partnerBanner.href}
          cta-icon="arrow_forward"
        >
          <h2 id="partner-heading" className="home-partner__title title-large">{home.partnerBanner.heading}</h2>
          <p className="home-partner__text body-large">{home.partnerBanner.body}</p>
        </sky-cta-banner>
      </PageSection>
    </div>
  );
}
export default Home;
