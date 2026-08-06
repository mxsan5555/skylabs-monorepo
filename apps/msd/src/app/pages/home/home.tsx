import { useNavigate, NavLink } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect } from 'react';
import { ListItem, List, FilledTonalIconButton, FilledButton, TextButton, Icon, Tabs, SecondaryTab, OutlinedTextField, AssistChip, } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { DEALS, getFeaturedDeals, getHotDeals, getDealsByCategory, } from '../../../data/deals';
import { CATEGORIES } from '../../../data/categories';
import { DealCard } from '../../components/deal-card';
import content from '../../../content.json';
import './home.css';
import '@skylabs-monorepo/shared-ui';
import { useCurrentLocation } from "../../../hooks/useCurrentLocation";
import Map from "../../components/map/map";
import type { Deal } from "../../../types";
const { home } = content;
const premiumHero = home.premiumHero;
const hotTabs = home.sections.hotRightNow.tabs;
const heroImages = home.heroImages as string[];
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
  const { toggle, has } = useWishlist();
  const spaFinder = content.home.spaFinderHero;
  const [selectedTab, setSelectedTab] = useState('all');
  const featuredDeals = getFeaturedDeals();
 const spaFinderDeals = DEALS.slice( 0, spaFinder.mapDealsLimit);
  const hotDeals = getHotDeals();
 const massageDeals = getDealsByCategory("massage").slice(0, spaFinder.limits.massage);
  const skinDeals = getDealsByCategory('skin-beauty').slice(0, 6);
  const nailDeals = getDealsByCategory('hair-nails').slice(0, 6);
  const spaDeals = getDealsByCategory('spas-retreats').slice(0, 6);
  const wellnessDeals = getDealsByCategory('health-wellness').slice(0, 6);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Deal[]>([]);
  const { location } = useCurrentLocation();
  const shortLocation = location?.split(",")[2]?.trim() ?? location;
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const results = DEALS.filter(
      (deal) =>
        deal.title.toLowerCase().includes(query) ||
        deal.providerName.toLowerCase().includes(query) ||
        deal.location.toLowerCase().includes(query)
    );
   setSuggestions( results.slice(0, spaFinder.suggestionLimit));
    setShowSuggestions(true);
  }, [searchQuery]);

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
          {deals.map((deal) => {
            return (
              <swiper-slide key={deal.id} style={{ width: '260px', height: 'auto' }} >
                <DealCard
                  deal={deal}
                  favoriteActive={has(deal.id)}
                  onFavorite={() => toggle(deal.id)}
                />
              </swiper-slide>
            );
          })}
        </swiper-container>
      </div>
    );
  }
  return (
    <div className="home">
      <title>{content.meta.home.title}</title>
      <meta name="description" content={content.meta.home.description} />
      {   /*spafinder like*/}
      {false && (
      <section className="home__spa-finder">
        <div className="home__spa-finder-left">
          <span className="home__spa-badge">  {spaFinder.title}</span>
          <h2 className="home__spa-title"> {spaFinder.heading} </h2>
          <p className="home__spa-subtitle"> {spaFinder.subheading} </p>
          <Tabs className="home__spa-tabs">
            {spaFinder.tabs.map((tab: any) => (
              <SecondaryTab key={tab.label} active={tab.label === spaFinder.defaultTab}>
                <Icon slot="icon">{tab.icon}</Icon>
                {tab.label}
              </SecondaryTab>
            ))}
          </Tabs>
          <sky-card variant="filled" className="home__spa-search-card">
            <form
              className="home__spa-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) { navigate(`/explore?q=${encodeURIComponent(searchQuery.trim())}`); }
                else { navigate("/explore"); }
                setShowSuggestions(false);
              }}
            >
              <TextButton type="button" className="home__spa-location" >
                <Icon>location_on</Icon>
                <span>{shortLocation ?? spaFinder.search.locationPlaceholder}</span>
              </TextButton>
              <div className="home__spa-search-input">
                <OutlinedTextField
                  className="premium-field"
                  value={searchQuery}
                  label={spaFinder.search.servicePlaceholder}
                  onInput={(e) => {
                    const target = e.currentTarget as HTMLInputElement;
                    setSearchQuery(target.value);
                    setShowSuggestions(true);
                  }}
                >
                  <Icon slot="leading-icon">  search </Icon>
                  {searchQuery && (
                    <Icon
                      slot="trailing-icon"
                      style={{ cursor: "pointer" }}
                      onClick={() => setSearchQuery("")}
                    >
                      close
                    </Icon>
                  )}
                </OutlinedTextField>
                {showSuggestions && (
                  <List className="search-suggestions">
                    {suggestions.length > 0 ? (
                      suggestions.map((deal) => (
                        <ListItem
                          key={deal.id}
                          type="button"
                          onClick={() => {
                            navigate(`/deal/${deal.id}`);
                            setSearchQuery("");
                            setShowSuggestions(false);
                          }}
                        >
                          <Icon slot="start">  search </Icon>
                          <div>
                            <strong>{deal.title}</strong>
                            <small> {deal.providerName} • {deal.location} </small>
                          </div>
                        </ListItem>
                      ))
                    ) : (
                      <ListItem disabled> No results found </ListItem>
                    )}
                  </List>
                )}
              </div>
              <FilledButton type="submit"> Search
                <Icon slot="trailing-icon">  arrow_forward </Icon>
              </FilledButton>
            </form>

          </sky-card>
          <div className="home__spa-popular">
            {spaFinder.popular.map((item: string) => (
              <AssistChip key={item}> {item} </AssistChip>
            ))}
          </div>
        </div>
        <div className="home__spa-finder-right">
          <Map deals={spaFinderDeals} />
        </div>
      </section>
)}
      {/*premm-hero*/}
      {/* {false && ( */}
        <section className="home__premium-hero">
          <div className="home__premium-content">
            <div className="home__premium-left">
              <h1 className="home__premium-title"> {premiumHero.heading} </h1>
              <p className="home__premium-subtitle"> {premiumHero.subheading}</p>
              <div className="home__premium-tabs">
                {premiumHero.tabs.map((tab) => (
                  <AssistChip key={tab.label}>
                    <Icon slot="icon"> {tab.icon} </Icon>
                    {tab.label}
                  </AssistChip>
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
                  <TextButton type="button" className="home__premium-location">
                    <Icon> location_on </Icon>
                    <span>{shortLocation ?? premiumHero.search.locationPlaceholder}</span>
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
                            <small>{deal.providerName} • {deal.location} </small>
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
                <span className="popular-label"> Popular: </span>
                {premiumHero.popular.map((item) => (
                  <AssistChip key={item}> {item} </AssistChip>
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
      {/* )} */}
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

      <section
        className="home-section home-section--alt"
        aria-label="Member promotion"
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
        aria-label="Gift cards promotion"
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

      {/* ── Per-category horizontal sections ──────────────────────────── */}
      {
        massageDeals.length > 0 && (
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
        )
      }
      <section className="home-section ">
        <div className="home-section__container">

          <div className="home-section__header">
            <h2 className="home-section__heading">
              {home.vacationStays.title}
            </h2>
          </div>

          <div className="vacation-slider">

            <swiper-container
              ref={vacationSwiperRef}
              navigation={false}
              pagination={false}
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

            <FilledTonalIconButton
              className="slider-btn slider-btn--prev"
              onClick={() => vacationSwiperRef.current?.swiper.slidePrev()}
            >
              <Icon>navigate_before</Icon>
            </FilledTonalIconButton>

            <FilledTonalIconButton
              className="slider-btn slider-btn--next"
              onClick={() => vacationSwiperRef.current?.swiper.slideNext()}
            >
              <Icon>navigate_next</Icon>
            </FilledTonalIconButton>

          </div>

        </div>
      </section>
      {
        skinDeals.length > 0 && (
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
        )
      }

      {
        nailDeals.length > 0 && (
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
        )
      }

      {
        spaDeals.length > 0 && (
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
        )
      }

      {
        wellnessDeals.length > 0 && (
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
        )
      }

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
