import { Link, useParams } from 'react-router-dom';
import {
  SkyBadgeReact,
  FilledButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { spas } from '../../data/spas';
import './spa-details.css';

export function SpaDetails() {
  const { id } = useParams();

  const spa = spas.find((item) => item.id === Number(id));

  if (!spa) {
    return (
      <main className="spa-details spa-details--missing">
        <h1>Spa not found</h1>
        <p>The spa you're looking for doesn't exist.</p>

        <Link to="/search">
          ← Back to Search
        </Link>
      </main>
    );
  }

  return (
    <main className="spa-details">

      <nav className="spa-details__breadcrumb">
        <Link to="/">
          <Icon>arrow_back</Icon>
          Back to Home
        </Link>
      </nav>

      <section className="spa-details__hero">

        <div className="spa-details__image-wrapper">
          <img
            src={spa.image}
            alt={spa.imageAlt}
            className="spa-details__image"
          />

          <div className="spa-details__badge">
            <SkyBadgeReact>{spa.badge}</SkyBadgeReact>
          </div>
        </div>

        <div className="spa-details__content">

          <h1>{spa.heading}</h1>

          <h3>{spa.eyebrow}</h3>

          <div className="spa-details__info">

            <p>
              <Icon>location_on</Icon>
              {spa.location}
            </p>

            <p>
              <Icon>star</Icon>
              {spa.rating} ({spa.reviews} Reviews)
            </p>

            <p>
              <Icon>near_me</Icon>
              {spa.distance}
            </p>

          </div>

          <div className="spa-details__price">

            <span className="old-price">
              {spa.originalPrice}
            </span>

            <span className="new-price">
              {spa.price}
            </span>

            <SkyBadgeReact variant="secondary">
              {spa.discount}
            </SkyBadgeReact>

          </div>

          <p className="price-note">
            {spa.priceNote}
          </p>

          <div className="spa-details__button">
            <FilledButton>
              Book Now
            </FilledButton>
          </div>

        </div>

      </section>

    </main>
  );
}

export default SpaDetails;