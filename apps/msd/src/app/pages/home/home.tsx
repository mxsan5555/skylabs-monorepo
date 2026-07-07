import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  SkyCardReact,
  SkyBadgeReact,
  SkyProductCardReact,
  SkyInfoCardReact,
} from '@skylabs-monorepo/shared-ui/react';
import './home.css';
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
  const navigate = useNavigate();
  const slideImages = [spa1, spa2, spa3, spa4, spa5, spa6, spa7];

  const slides = () =>
    slideImages.map((img, index) => (
      <swiper-slide key={index}>
        <img
          src={img}
          alt={`Banner ${index + 1}`}
          className="hero-carousel__image"
        />
      </swiper-slide>
    ));
  return (
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
        <h2>Cards</h2>

        <div className="cards-grid">
          {spas.map((spa) => (
            <Link
              key={spa.id}
              to={`/spa/${spa.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <SkyProductCardReact
                image={spa.image}
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
          ))}
          <SkyInfoCardReact
            align="center"
            icon="support_agent"
            heading="Trusted 24/7 customer service you can rely on"
            subheading="We're always here to help"
          />
        </div>
      </section>

      {/* React 19 hoists these to <head>. */}
      <title>MSD — Your wellness companion</title>
      <meta
        name="description"
        content="MSD, your wellness companion. Sign in to receive a one-time code and get started."
      />

      <section className="home__hero">
        <SkyBadgeReact>msd</SkyBadgeReact>
        <h1>Welcome to msd</h1>
        <p>
          A React app built on the shared Material 3 design system. Pages live
          here; reusable UI lives in <code>shared-ui</code>.
        </p>
        <div className="home__actions">
          <FilledButton onClick={() => navigate('/showcase')}>
            View component showcase
          </FilledButton>
          <OutlinedButton onClick={() => navigate('/blog')}>
            Read the blog
          </OutlinedButton>
        </div>
      </section>

      <section className="home__cards">
        <SkyCardReact variant="elevated">
          <h2>Reusable UI</h2>
          <p>Material Web + custom LIT components, themed per app.</p>
        </SkyCardReact>
        <SkyCardReact variant="outlined">
          <h2>App-owned pages</h2>
          <p>Routing, auth, and data stay native to each framework.</p>
        </SkyCardReact>
      </section>



    </div>
  );
}

export default Home;
