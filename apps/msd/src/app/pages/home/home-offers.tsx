import { Link } from 'react-router-dom';
import content from '../../../content.json';

const { home } = content;

/** Offers bento: welcome offer photo card, gift cards, and member pricing (signed-out only). */
export function HomeOffers({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="home-band" aria-labelledby="offers-heading">
      <div className={`home-container home-offers${isAuthenticated ? ' home-offers--member' : ''}`}>
        <article className="home-offer home-offer--welcome">
          <img className="home-offer__bg" src={home.welcomeOffer.image} alt="" loading="lazy" decoding="async" />
          <div className="home-offer__content">
            <h2 id="offers-heading" className="home-offer__title">{home.welcomeOffer.title}</h2>
            <p className="home-offer__subtitle">{home.welcomeOffer.subtitle}</p>
            <p className="home-offer__text">{home.welcomeOffer.description}</p>
            {/* Light-DOM link so the CTA is real, crawlable HTML in prerendered pages. */}
            <Link to="/explore" className="home-offer__cta label-large">{home.welcomeOffer.cta}</Link>
          </div>
        </article>

        <sky-feature-card
          className="home-offer--gift"
          color="secondary"
          icon="card_giftcard"
          icon-style="surface"
          headline={home.giftCard.heading}
          text={home.giftCard.body}
          cta-label={home.giftCard.cta}
          cta-href="/gift-cards"
        />

        {!isAuthenticated && (
          <sky-feature-card
            color="surface-high"
            icon={home.memberBanner.icon}
            icon-style="surface"
            headline={home.memberBanner.heading}
            text={home.memberBanner.body}
            cta-label={home.memberBanner.button}
            cta-href={home.memberBanner.buttonLink}
          />
        )}
      </div>
    </section>
  );
}
