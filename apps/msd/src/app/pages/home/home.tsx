import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  TextButton,
  Icon,
  OutlinedTextField,
  SkyCategoryCardReact,
  SkyCardReact,
<<<<<<< HEAD
  SkyBadgeReact,
  SkyProductCardReact,
  Icon,
  SkyInfoCardReact,
=======
  AssistChip,
>>>>>>> b8ad1f645856014b185848c108bb9207db76e646
} from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useWishlist } from '../../../wishlist/wishlist-context';
import {
  DEALS,
  getFeaturedDeals,
  getHotDeals,
  getDealsByCategory,
} from '../../../data/deals';
import { CATEGORIES } from '../../../data/categories';
import { DealCard } from '../../components/deal-card';
import content from '../../../content.json';
import './home.css';
<<<<<<< HEAD
import spa1 from '../../../assets/imgs/spa1.avif';
import spa2 from '../../../assets/imgs/spa2.webp';
import spa3 from '../../../assets/imgs/spa3.jpg';
import spa4 from '../../../assets/imgs/spa4.webp';
import spa5 from '../../../assets/imgs/spa5.avif';
import spa6 from '../../../assets/imgs/spa6.webp';
import spa7 from '../../../assets/imgs/spa7.jfif';
import { spas } from '../../data/spas';
import { Link } from 'react-router-dom';
// import { SearchBar } from '../../components/search-bar';
/**
 * Sample landing page. Demonstrates a page composed from shared-ui components
 * and themed by msd's palette. Real content/data arrives with the blog/contact
 * pages and the backend.
 */

export function Home() {
=======

const { home } = content;

function SectionHeader({
  heading,
  seeAll,
  seeAllTo,
}: {
  heading: string;
  seeAll: string;
  seeAllTo: string;
}) {
>>>>>>> b8ad1f645856014b185848c108bb9207db76e646
  const navigate = useNavigate();
  const slideImages = [spa1, spa2, spa3, spa4, spa5, spa6, spa7];

  const slides = () =>
    slideImages.map((img, index) => (
      <swiper-slide key={index}>
        <img
          src={img}
          alt={`Banner ${index + 1}`}
          className="hero-carousel__slide"
        />
      </swiper-slide>
    ));

  return (
<<<<<<< HEAD
    <div className="home">

      <section >
        <swiper-container
          className="demo-carousel"
          navigation="true"
          pagination="true"
        >
          {slides()}
        </swiper-container>
      </section>

      <section className="showcase__card">
        <div className="spa-section__header">
          <Icon>local_fire_department</Icon>
          <h2> Trending Spas
          </h2>
        </div>

        <swiper-container
          className="spa-carousel"
          navigation="true"
          // pagination="false"
          slides-per-view="4"
          space-between="20"
        >
          {spas.map((spa) => (
            <swiper-slide key={spa.id}>
              <Link
                to={`/spa/${spa.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <SkyProductCardReact
                  image={spa.image[0]}
                  imageAlt={spa.imageAlt}
                  badge={spa.badge}
                  favorite
                  eyebrow={spa.eyebrow}
                  heading={spa.heading}
                  location={spa.location}
                  distance={spa.distance}
                  rating={spa.rating}
                  reviews={spa.reviews}
                  originalPrice={spa.originalPrice}
                  price={spa.price}
                  discount={spa.discount}
                  priceNote={spa.priceNote}
                />
              </Link>
            </swiper-slide>
          ))}
        </swiper-container>
      </section>

      <section className="showcase__card">
        <div className="spa-section__header">
          <Icon>diamond</Icon>
          <h2> Luxury Spa Collection
          </h2>
        </div>

        <swiper-container
          className="spa-carousel"
          scrollbar="true"
          // pagination="false"
          slides-per-view="4"
          space-between="20"
        >
          {spas.map((spa) => (
            <swiper-slide key={spa.id}>
              <Link
                to={`/spa/${spa.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <SkyProductCardReact
                  image={spa.image[0]}
                  imageAlt={spa.imageAlt}
                  badge={spa.badge}
                  favorite
                  eyebrow={spa.eyebrow}
                  heading={spa.heading}
                  location={spa.location}
                  distance={spa.distance}
                  rating={spa.rating}
                  reviews={spa.reviews}
                  originalPrice={spa.originalPrice}
                  price={spa.price}
                  discount={spa.discount}
                  priceNote={spa.priceNote}
                />
              </Link>
            </swiper-slide>
          ))}
        </swiper-container>
      </section>

      <section className="showcase__card">
        <div className="spa-section__header">
          <Icon>workspace_premium</Icon>
          <h2> Premium Experiences
          </h2>
        </div>

        <swiper-container
          className="spa-carousel"
          loop="true"
          navigation="true"
          slides-per-view="4"
          space-between="16"
        >
          {spas.map((spa) => (
            <swiper-slide key={spa.id}>
              <Link
                to={`/spa/${spa.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <SkyProductCardReact
                  image={spa.image[0]}
                  imageAlt={spa.imageAlt}
                  badge={spa.badge}
                  favorite
                  eyebrow={spa.eyebrow}
                  heading={spa.heading}
                  location={spa.location}
                  distance={spa.distance}
                  rating={spa.rating}
                  reviews={spa.reviews}
                  originalPrice={spa.originalPrice}
                  price={spa.price}
                  discount={spa.discount}
                  priceNote={spa.priceNote}
                />
              </Link>
            </swiper-slide>
          ))}
        </swiper-container>
      </section>

      {/* React 19 hoists these to <head>. */}
      <title>MSD — Your wellness companion</title>
      <meta
        name="description"
        content="MSD, your wellness companion. Sign in to receive a one-time code and get started."
      />
=======
    <div className="home-section__header">
      <h2 className="home-section__heading">{heading}</h2>
      <TextButton onClick={() => navigate(seeAllTo)}>
        {seeAll}
        <Icon slot="trailing-icon" aria-hidden="true">chevron_right</Icon>
      </TextButton>
    </div>
  );
}
>>>>>>> b8ad1f645856014b185848c108bb9207db76e646

export function Home() {
  const navigate = useNavigate();
  const { toggle, has } = useWishlist();

  const featuredDeals = getFeaturedDeals();
  const hotDeals = getHotDeals();
  const massageDeals = getDealsByCategory('massage').slice(0, 6);
  const skinDeals = getDealsByCategory('skin-beauty').slice(0, 6);
  const nailDeals = getDealsByCategory('hair-nails').slice(0, 6);
  const spaDeals = getDealsByCategory('spas-retreats').slice(0, 6);
  const wellnessDeals = getDealsByCategory('health-wellness').slice(0, 6);

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
              <DealCard
                deal={deal}
                favoriteActive={has(deal.id)}
                onFavorite={() => toggle(deal.id)}
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
        <div className="home__hero-bg" aria-hidden="true" />
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
              <SkyCategoryCardReact
                key={cat.id}
                image={cat.image}
                imageAlt={cat.imageAlt}
                heading={cat.name}
                subheading={`${cat.serviceCount} services`}
                href={`/category/${cat.slug}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Hot Right Now ──────────────────────────────────────────────── */}
      <section className="home-section" aria-labelledby="hot-heading">
        <div className="home-section__container">
          <SectionHeader
            id="hot-heading"
            heading={home.sections.hotRightNow.heading}
            seeAll={home.sections.hotRightNow.seeAll}
            seeAllTo={home.sections.hotRightNow.seeAllTo}
          />
          {renderDealCarousel(hotDeals)}
        </div>
      </section>

      {/* ── Gift Cards CTA ─────────────────────────────────────────────── */}
      <section className="home-section home-section--alt" aria-label="Gift cards promotion">
        <div className="home-section__container">
          <SkyCardReact variant="filled" className="home__promo-card">
            <div className="home__promo-inner">
              <div className="home__promo-text">
                <AssistChip label={home.giftCard.chip}>
                  <Icon slot="icon" aria-hidden="true">card_giftcard</Icon>
                </AssistChip>
                <h2 className="home__promo-heading">{home.giftCard.heading}</h2>
                <p className="home__promo-body">{home.giftCard.body}</p>
              </div>
              <OutlinedButton onClick={() => navigate('/gift-cards')}>
                {home.giftCard.cta}
              </OutlinedButton>
            </div>
          </SkyCardReact>
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
      <section className="home-section home-section--alt" aria-label="Welcome offer promotion">
        <div className="home-section__container">
          <SkyCardReact variant="outlined" className="home__promo-card home__promo-card--welcome">
            <div className="home__promo-inner">
              <div className="home__promo-text">
                <AssistChip label={home.welcomeOffer.chip}>
                  <Icon slot="icon" aria-hidden="true">local_offer</Icon>
                </AssistChip>
                <h2 className="home__promo-heading">{home.welcomeOffer.heading}</h2>
                <p className="home__promo-body">{home.welcomeOffer.body}</p>
              </div>
              <FilledButton onClick={() => navigate('/explore')}>
                {home.welcomeOffer.cta}
              </FilledButton>
            </div>
          </SkyCardReact>
        </div>
      </section>



    </div>
  );
}

export default Home;
