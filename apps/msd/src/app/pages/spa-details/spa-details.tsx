import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FilledButton, Icon, SkyBadgeReact, Divider,
  SkyProductCardReact, OutlinedIconButton,
  FilledIconButton, FilledTonalButton, ListItem, List, AssistChip, SkyCardReact
} from '@skylabs-monorepo/shared-ui/react';
import { spas } from '../../data/spas';
import './spa-details.css';

export function SpaDetails() {
  const { id } = useParams();
  const [selectedImage, setSelectedImage] = useState(0);
  const spa = spas.find(
    (item) => item.id === Number(id)
  );
  if (!spa) {
    return (
      <main className="spa-details spa-details--missing">
        <h1>Spa not found</h1>
        <p>  The spa you're looking for doesn't exist. </p>
        <Link to="/search">
          ← Back to Search
        </Link>
      </main>
    );
  }
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({
        title: spa.heading,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link copied!");
    }
  };
  const scrollToSection = (id: string) => {
    const section = document.getElementById(id);
    if (section) {
      section.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };
  const similarSpas = spas
    .filter(
      (item) =>
        item.city === spa.city &&
        item.id !== spa.id
    )
    .slice(0, 4);

  return (
    <main className="spa-details">
      <nav className="spa-details__breadcrumb">
        <Link to="/">
          <Icon>arrow_back</Icon>
          Back to Home
        </Link>
      </nav>
      <div className="spa-layout">
        <div className="spa-left">
          <header className="spa-header">

            <SkyBadgeReact>
              {spa.badge}
            </SkyBadgeReact>

            <h1>{spa.heading}</h1>

            <p className="spa-subtitle">
              {spa.eyebrow}
            </p>

            <div className="spa-meta">

              <AssistChip>
                <Icon slot="icon">star</Icon>
                {spa.rating}
              </AssistChip>

              <span>
                ({spa.reviews} Reviews)
              </span>

              <span>
                <Icon>location_on</Icon>
                {spa.location}
              </span>

            </div>

          </header>
          <div className="spa-gallery">

            <div className="spa-image-wrapper">
              <img
                src={spa.image[selectedImage]}
                alt={spa.imageAlt}
                className="spa-main-image"
              />

              <div className="spa-image-actions">
                <FilledIconButton aria-label="Favorite" toggle>
                  <Icon>favorite_border</Icon>
                  <Icon slot="selected">favorite</Icon>
                </FilledIconButton>

                <OutlinedIconButton
                  aria-label="Share"
                  onClick={handleShare}
                >
                  <Icon>share</Icon>
                </OutlinedIconButton>
              </div>
            </div>

            <div className="spa-thumbnails">
              {spa.image.map((img, index) => (
                <img
                  key={index}
                  src={img}
                  alt=""
                  className={`spa-thumb ${selectedImage === index ? "active" : ""
                    }`}
                  onClick={() => setSelectedImage(index)}
                />
              ))}
            </div>

          </div>
          <nav className="spa-sticky-nav">
            <button onClick={() => scrollToSection('about')}>
              About
            </button>

            <button onClick={() => scrollToSection('highlights')}>
              Highlights
            </button>

            <button onClick={() => scrollToSection('location')}>
              Location
            </button>

            <button onClick={() => scrollToSection('reviews')}>
              Reviews
            </button>
          </nav>
          <section id="about" className="spa-block">
            <h2>About this experience</h2>
            <p>{spa.description}</p>
          </section>
          <Divider />
          <section id='highlights' className="spa-block">
            <h2>Highlights</h2>
            <div className="highlights-grid">
              {spa.highlights.map((item) => (
                <div className="highlight-item" key={item}>
                  <Icon>check_circle</Icon>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
          <Divider />
          <section className="spa-block">
            <h2>Services Included</h2>
            <div className="services-chip-grid">
              {spa.services.map(service => (
                <AssistChip key={service}>
                  {service}
                </AssistChip>
              ))}
            </div>
          </section>
          <Divider />
          <section id='location' className="spa-block">
            <h2>Location</h2>
            <p className="location-text">
              <Icon>location_on</Icon>
              {spa.location}
            </p>
            <iframe
              title={spa.heading}
              loading="lazy"
              className="location-map"
              src={`https://maps.google.com/maps?q=${spa.lat},${spa.lng}&z=15&output=embed`}
            />
          </section>
          <Divider />
        </div>
        <aside className="booking-sidebar">

          <div className="booking-box">
            <div className="booking-offer">
              <p>{spa.priceNote}</p>

              <AssistChip>
                Extra 20% OFF
              </AssistChip>
            </div>




            <div className="booking-package">

              <SkyBadgeReact>
                {spa.badge}
              </SkyBadgeReact>

              <h3>{spa.eyebrow}</h3>

              <p>{spa.heading}</p>

              <div className="booking-price">

                <span className="old-price">
                  {spa.originalPrice}
                </span>

                <span className="new-price">
                  {spa.price}
                </span>

              </div>

              <div className="booking-actions">

                <FilledButton>
                  Book Now
                </FilledButton>

                <FilledTonalButton>
                  Save
                </FilledTonalButton>

              </div>

              <List>

                <ListItem>
                  <Icon slot="start">check_circle</Icon>
                  Instant Confirmation
                </ListItem>

                <ListItem>
                  <Icon slot="start">check_circle</Icon>
                  Free Cancellation
                </ListItem>

                <ListItem>
                  <Icon slot="start">check_circle</Icon>
                  Secure Payment
                </ListItem>

              </List>

            </div>

          </div>

        </aside>

      </div>

      <section id='reviews' className="spa-block reviews-section">
        <h2>Customer Reviews</h2>

        <div className="reviews-grid">

          <div className="review-item">
            <div className="review-top">
              <div className="review-user">
                <div className="review-avatar">
                  <Icon>person</Icon>
                </div>
                <div>
                  <strong>Rahul Sharma</strong>

                  <div className="review-chips">
                    <AssistChip>
                      12 Ratings
                    </AssistChip>

                    <AssistChip>
                      5 Reviews
                    </AssistChip>


                  </div>
                </div>
              </div>

              <span className="review-date">
                2 days ago
              </span>
            </div>

            <div className="review-stars">
              <Icon>star</Icon>
              <Icon>star</Icon>
              <Icon>star</Icon>
              <Icon>star</Icon>
              <Icon>star</Icon>
            </div>

            <p>
              Amazing experience. Everything was clean, staff was polite and massage quality exceeded expectations.
            </p>
          </div>

          <div className="review-item">
            <div className="review-top">
              <div className="review-user">
                <div className="review-avatar"><Icon>person</Icon></div>

                <div>
                  <strong>Priya Gupta</strong>

                  <div className="review-chips">

                    <AssistChip>
                      8 Ratings
                    </AssistChip>

                    <AssistChip>
                      3 Reviews
                    </AssistChip>

                  </div>
                </div>
              </div>

              <span className="review-date">
                1 week ago
              </span>
            </div>

            <div className="review-stars">
              <Icon>star</Icon>
              <Icon>star</Icon>
              <Icon>star</Icon>
              <Icon>star</Icon>
              <Icon>star</Icon>
            </div>

            <p>
              Beautiful ambience, professional therapists and worth every rupee.
            </p>
          </div>


        </div>
      </section>
      <Divider />

      <section className="spa-similar">
        <h2>You May Also Like</h2>

        <div className="similar-grid">
          {similarSpas.map((item) => (
            <Link
              key={item.id}
              to={`/spa/${item.id}`}
              style={{
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <SkyProductCardReact
                image={item.image[0]}
                imageAlt={item.imageAlt}
                badge={item.badge}
                favorite
                eyebrow={item.eyebrow}
                heading={item.heading}
                location={item.location}
                distance={item.distance}
                rating={item.rating}
                reviews={item.reviews}
                originalPrice={item.originalPrice}
                price={item.price}
                discount={item.discount}
                priceNote={item.priceNote}
              />
            </Link>
          ))}
        </div>
      </section>

    </main >
  );
}

export default SpaDetails;

