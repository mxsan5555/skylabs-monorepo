import { useNavigate } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { FilledButton, TextButton, Icon, Tabs, SecondaryTab, OutlinedTextField, AssistChip, } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { DEALS, getFeaturedDeals, getHotDeals, getDealsByCategory, } from '../../../data/deals';
import { CATEGORIES } from '../../../data/categories';
import { DealCard } from '../../components/deal-card';
import { SkyProductCardWC } from '../../components/sky-product-card-wc';
import content from '../../../content.json';
import './home.css';

const { home } = content;
const hotTabs = home.sections.hotRightNow.tabs;
const { dealOfTheDay } = content;
const heroImages = home.heroImages as string[];
function SectionHeader({
  heading,
  seeAll,
  seeAllTo,
}: {
  heading: string;
  seeAll: string;
  seeAllTo: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="home-section__header">
      <h2 className="home-section__heading">{heading}</h2>
      <TextButton onClick={() => navigate(seeAllTo)}>
        {seeAll}
        <Icon slot="trailing-icon" aria-hidden="true">chevron_right</Icon>
      </TextButton>
    </div>
  );
}

export function Home() {
  const navigate = useNavigate();
  const { toggle, has } = useWishlist();
  const [selectedTab, setSelectedTab] = useState('all');
  const featuredDeals = getFeaturedDeals();
  const hotDeals = getHotDeals();
  const massageDeals = getDealsByCategory('massage').slice(0, 6);
  const skinDeals = getDealsByCategory('skin-beauty').slice(0, 6);
  const nailDeals = getDealsByCategory('hair-nails').slice(0, 6);
  const spaDeals = getDealsByCategory('spas-retreats').slice(0, 6);
  const wellnessDeals = getDealsByCategory('health-wellness').slice(0, 6);

  const filteredHotDeals = useMemo(() => {
    if (selectedTab === 'all') {
      return hotDeals;
    }
    return hotDeals.filter(
      deal => deal.categorySlug === selectedTab
    );
  }, [selectedTab, hotDeals]);

  function renderDealCarousel(deals: typeof DEALS) {
    return (
      <div className="home-carousel">
        <swiper-container
          slides-per-view="auto"
          space-between={16}
          free-mode="true"
          grab-cursor="true"
        >
          {deals.map((deal) => (
            <swiper-slide key={deal.id} style={{ width: '260px', height: 'auto' }}>
              <SkyProductCardWC
                image={deal.image}
                gallery={deal.gallery}
                imageAlt={deal.imageAlt}
                badge={deal.badge}

                favorite={true}
                favoriteActive={has(deal.id)}
                onFavorite={() => toggle(deal.id)}

                eyebrow={deal.providerName}
                heading={deal.title}
                location={deal.location}
                distance={`${deal.distance} km`}
                rating={deal.rating}
                reviews={deal.reviews}
                originalPrice={deal.originalPrice ? `₹${deal.originalPrice}` : undefined}
                price={`₹${deal.price}`}
                discount={deal.discount ? `${deal.discount}% OFF` : undefined}
                priceNote={deal.priceNote}
              />
            </swiper-slide>
          ))}
        </swiper-container>
      </div>
    );
  }

  return (
    <div className="home">
      <title>{content.meta.home.title}</title>
      <meta name="description" content={content.meta.home.description} />

      {/* ── Hero / Search ──────────────────────────────────────────────── */}
      <section className="home__hero" aria-labelledby="hero-heading">
        <div className="home__hero-slider">
          {heroImages.map((image, index) => (
            <div
              key={index}
              className="home__hero-slide"
              style={{
                backgroundImage: `url(${image})`,
                animationDelay: `${index * 6}s`,
              }}
            />
          ))}
        </div>

        {/* Dark overlay */}
        <div className="home__hero-overlay"></div>
        <div className="home__hero-content">
          <h1 id="hero-heading" className="home__hero-heading">
            {home.hero.heading}
          </h1>
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
            <OutlinedTextField
              name="q"
              label={home.hero.searchPlaceholder}
              className="home__hero-search-field"
            >
              <Icon slot="leading-icon" aria-hidden="true">search</Icon>
            </OutlinedTextField>
            <FilledButton type="submit">{home.hero.ctaLabel}</FilledButton>
          </form>
        </div>
        {/* <div className="home__hero-bg" aria-hidden="true" /> */}
      </section>

      {/* Deal of the Day */}
      {/* <section className="home-deal">
        <div className="home-deal__container">
          <div className="home-deal__image">
            <img
              src={dealOfTheDay.image}
              alt={dealOfTheDay.title}
            />
          < /div>

          <sky-card
            variant="filled"
            className="home-deal__card"
          >
            <div className="home-deal__badge">
              <Icon>local_fire_department</Icon>
              <span>{dealOfTheDay.badge}</span>
            </div>
            <h2 className="home-deal__title">
              {dealOfTheDay.title}
            </h2>
            <p className="home-deal__subtitle">
              {dealOfTheDay.subtitle}
            </p>
            <div className="home-deal__meta">
              <div className="home-deal__rating">
                <Icon>star</Icon>
                <span>{dealOfTheDay.rating.value}</span>
              </div>
              <span className="dot">•</span>
              <span>
                {dealOfTheDay.rating.reviews} Reviews
              </span>
              <span className="dot">•</span>
              <span>{dealOfTheDay.duration}</span>
              <span className="dot">•</span>
              <span>{dealOfTheDay.location}</span>
            </div>
            <div className="home-deal__pricing">
              <span className="home-deal__discount">
                {dealOfTheDay.discount}
              </span>
              <div className="home-deal__prices">
                <span className="home-deal__price">
                  {dealOfTheDay.price}
                </span>
                <span className="home-deal__original-price">
                  {dealOfTheDay.originalPrice}
                </span>
              </div>
            </div>
         
            <div className="home-deal__features">
              {dealOfTheDay.features.map((feature) => (
                <div
                  key={feature.label}
                  className="home-deal__feature"
                >
                  <Icon>{feature.icon}</Icon>
                  <span>{feature.label}</span>
                </div>
              ))}
            </div>
            <div className="home-deal__coupon">
              <div className="home-deal__coupon-code">
                <Icon>sell</Icon>
                <strong>
                  {dealOfTheDay.coupon.code}
                </strong>
              </div>
              <p className="home-deal__coupon-description">
                {dealOfTheDay.coupon.description}
              </p>
            </div>
            <FilledButton className="home-deal__button">
              {dealOfTheDay.buttonText}
            </FilledButton>
          </sky-card>
        </div>
      </section> */}

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
            {CATEGORIES.map((cat) => (
              <NavLink
                key={cat.id}
                to={`/category/${cat.slug}`}
                className="category-card"
              >
                <div className="category-card__icon-wrap">
                  <Icon className="category-card__icon">
                    {cat.icon}
                  </Icon>
                </div>

                <div className="category-card__content">
                  <h3>{cat.name}</h3>
                  <p>{cat.serviceCount} Services</p>
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
        aria-label="Gift cards promotion"
      >
        <div className="home-section__container">

          <sky-card
            variant="filled"
            className="home__gift-card"
            style={{
              backgroundImage: `url(${home.giftCard.image})`,
            }}
          >

            <div className="home__gift-content">

              <div className="home__gift-left">

                <AssistChip
                  className="home__promo-chip"
                  label={home.giftCard.chip}
                >
                  <Icon slot="icon">card_giftcard</Icon>
                </AssistChip>

                <h2 className="home__gift-heading">
                  {home.giftCard.heading}
                </h2>

                <p className="home__gift-body">
                  {home.giftCard.body}
                </p>

                <div className="home__gift-features">
                  {home.giftCard.features.map((item) => (
                    <div className="home__gift-feature">
                      <Icon className="home__gift-feature-icon">
                        {item.icon}
                      </Icon>
                      <span>{item.title}</span>
                    </div>
                  ))}
                </div>

                <FilledButton
                  onClick={() => navigate('/gift-cards')}
                >
                  {home.giftCard.cta}
                </FilledButton>

              </div>

              <div className="home__gift-right">
                {/* Empty only for spacing */}
              </div>

            </div>

          </sky-card>

        </div>
      </section>

      {/* ── Per-category horizontal sections ──────────────────────────── */}
      {massageDeals.length > 0 && (
        <section className="home-section" aria-labelledby="massage-heading">
          <div className="home-section__container">
            <SectionHeader
              id="massage-heading"
              heading={home.sections.massageTherapy.heading}
              seeAll={home.sections.massageTherapy.seeAll}
              seeAllTo={home.sections.massageTherapy.seeAllTo}
            />
            {renderDealCarousel(massageDeals)}
          </div>
        </section>
      )}
      <section className="home-section home-vacation-section">
        <div className="home-section__header">
          <h1>{home.vacationStays.title}</h1>
        </div>

        <swiper-container
          navigation="true"
          slides-per-view="auto"
          space-between="20"
          grab-cursor="true"
        >
          {home.vacationStays.items.map((item) => (
            <swiper-slide key={item.label} className="home-stays-slide">
              <sky-image-card
                image={item.image}
                imageAlt={item.imageAlt}
                label={item.label}
                href={item.href}
              />
            </swiper-slide>
          ))}
        </swiper-container>
      </section>
      {skinDeals.length > 0 && (
        <section className="home-section home-section--alt" aria-labelledby="facial-heading">
          <div className="home-section__container">
            <SectionHeader
              id="facial-heading"
              heading={home.sections.facialSkin.heading}
              seeAll={home.sections.facialSkin.seeAll}
              seeAllTo={home.sections.facialSkin.seeAllTo}
            />
            {renderDealCarousel(skinDeals)}
          </div>
        </section>
      )}

      {nailDeals.length > 0 && (
        <section className="home-section" aria-labelledby="nail-heading">
          <div className="home-section__container">
            <SectionHeader
              id="nail-heading"
              heading={home.sections.nailCare.heading}
              seeAll={home.sections.nailCare.seeAll}
              seeAllTo={home.sections.nailCare.seeAllTo}
            />
            {renderDealCarousel(nailDeals)}
          </div>
        </section>
      )}

      {spaDeals.length > 0 && (
        <section className="home-section home-section--alt" aria-labelledby="spa-heading">
          <div className="home-section__container">
            <SectionHeader
              id="spa-heading"
              heading={home.sections.spasRetreats.heading}
              seeAll={home.sections.spasRetreats.seeAll}
              seeAllTo={home.sections.spasRetreats.seeAllTo}
            />
            {renderDealCarousel(spaDeals)}
          </div>
        </section>
      )}

      {wellnessDeals.length > 0 && (
        <section className="home-section" aria-labelledby="wellness-heading">
          <div className="home-section__container">
            <SectionHeader
              id="wellness-heading"
              heading={home.sections.healthWellness.heading}
              seeAll={home.sections.healthWellness.seeAll}
              seeAllTo={home.sections.healthWellness.seeAllTo}
            />
            {renderDealCarousel(wellnessDeals)}
          </div>
        </section>
      )}

      {/* ── Welcome Offer CTA ──────────────────────────────────────────── */}
      <section
        className="home-section home-section--alt"
        aria-label="Welcome offer promotion"
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
    </div>
  );
}

export default Home;
