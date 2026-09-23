import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import type { CatalogDeal } from '../../../api/catalog';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { formatINR } from '../../../utils/format';
import { primaryImage, resolveDealMedia, resolveTherapistMedia } from '../../../utils/media';
import { CardRail } from '../../components/card-rail/card-rail';
import { DealCard } from '../../components/deal-card';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import { Seo } from '../../seo/seo';
import { faqPageJsonLd, itemListJsonLd, type JsonLdObject } from '../../seo/jsonld';
import { SITE_URL } from '../../seo/site-url';
import { CategoryTiles } from './category-tiles';
import { DealsNearYou } from './deals-near-you';
import { HomeFaq } from './home-faq';
import { HomeHero } from './home-hero';
import { HomeOffers } from './home-offers';
import { HowItWorks } from './how-it-works';
import { TreatmentDirectory } from './treatment-directory';
import { HOME_RAIL_SIZE, toDealCardDeal, toProductCardDeal, useHomeCatalog } from './home-data';
import content from '../../../content.json';
import './home.css';

const { home } = content;

export function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toggle, has } = useWishlist();
  const { categories } = useCatalogShell();
  const { status: locationStatus, coords } = useVisitorLocation();
  const catalog = useHomeCatalog(locationStatus === 'locating' ? undefined : coords);
  const ready = catalog.status === 'ready';

  const spotlight = useMemo(
    () => [...catalog.deals].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))[0],
    [catalog.deals],
  );

  const jsonLd = useMemo(() => {
    const blocks: JsonLdObject[] = [];
    if (SITE_URL && catalog.deals.length > 0) {
      // The list covers the first HOME_RAIL_SIZE deals (what the Deals near you rail leads with).
      blocks.push(
        itemListJsonLd(
          SITE_URL,
          catalog.deals
            .slice(0, HOME_RAIL_SIZE)
            .map((d) => ({
              name: d.title,
              path: `/deal/${d.id}`,
              price: Number(d.salePrice),
              image: primaryImage(resolveDealMedia(d)) || undefined,
            })),
        ),
      );
    }
    if (catalog.faqs.length > 0) blocks.push(faqPageJsonLd(catalog.faqs));
    return blocks.length > 0 ? blocks : undefined;
  }, [catalog.deals, catalog.faqs]);

  const handleFavorite = (id: string) => {
    if (!isAuthenticated) {
      navigate('/sign-in');
      return;
    }
    toggle(id);
  };

  const renderDeal = (deal: CatalogDeal) => (
    <swiper-slide key={deal.id} className="card-rail__slide">
      <DealCard
        deal={toDealCardDeal(deal)}
        eyebrowHref={deal.vendor?.slug ? `/vendor/${deal.vendor.slug}` : undefined}
        favoriteActive={isAuthenticated && has(deal.id)}
        onFavorite={() => handleFavorite(deal.id)}
      />
    </swiper-slide>
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
      <HowItWorks />
      {ready && catalog.therapists.length > 0 && (
        <section className="home-band" aria-labelledby="therapists-heading">
          <div className="home-container">
            <CardRail
              id="therapists-heading"
              heading={home.sections.therapists.heading}
              seeAll={home.sections.therapists.seeAll}
              seeAllTo={home.sections.therapists.seeAllTo}
            >
              {catalog.therapists.map((therapist) => {
                const price = therapist.packages.length
                  ? Math.min(...therapist.packages.map((p) => Number(p.sellingPrice)))
                  : null;
                return (
                  <swiper-slide key={therapist.id} className="card-rail__slide">
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
            </CardRail>
          </div>
        </section>
      )}
      <HomeOffers isAuthenticated={isAuthenticated} />
      {ready && catalog.products.length > 0 && (
        <section className="home-band home-band--tint" aria-labelledby="products-heading">
          <div className="home-container">
            <CardRail
              id="products-heading"
              heading={home.sections.featuredProducts.heading}
              seeAll={home.sections.featuredProducts.seeAll}
              seeAllTo={home.sections.featuredProducts.seeAllTo}
            >
              {catalog.products.map((product) => (
                <swiper-slide key={product.id} className="card-rail__slide">
                  <DealCard
                    deal={toProductCardDeal(product)}
                    href={`/products/${product.id}`}
                    favoriteActive={isAuthenticated && has(product.id)}
                    onFavorite={() => handleFavorite(product.id)}
                  />
                </swiper-slide>
              ))}
            </CardRail>
          </div>
        </section>
      )}
      <TreatmentDirectory />
      {ready && <HomeFaq faqs={catalog.faqs} />}
      <section className="home-band home-band--flush" aria-labelledby="partner-heading">
        <div className="home-container">
          {/* Heading and body are slotted light DOM so the section has a real h2. */}
          <sky-cta-banner
            color="inverse"
            icon={home.partnerBanner.icon}
            iconStyle="tonal"
            iconShape="full"
            ctaLabel={home.partnerBanner.cta}
            ctaHref={home.partnerBanner.href}
            ctaIcon="arrow_forward"
          >
            <h2 id="partner-heading" className="home-partner__title title-large">{home.partnerBanner.heading}</h2>
            <p className="home-partner__text body-large">{home.partnerBanner.body}</p>
          </sky-cta-banner>
        </div>
      </section>
    </div>
  );
}

export default Home;
