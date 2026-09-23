import { createElement } from 'react';
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
            <p className="home-offer__badge">{home.welcomeOffer.badge}</p>
            <h2 id="offers-heading" className="home-offer__title">{home.welcomeOffer.title}</h2>
            <p className="home-offer__subtitle">{home.welcomeOffer.subtitle}</p>
            <p className="home-offer__text">{home.welcomeOffer.description}</p>
            {/* Raw tag so `href` is set outside the browser build too (the @lit/react wrapper drops it). */}
            {createElement('md-filled-button', { href: '/explore' }, home.welcomeOffer.cta)}
          </div>
        </article>

        <sky-feature-card
          className="home-offer--gift"
          color="primary"
          icon="card_giftcard"
          iconStyle="surface"
          headline={home.giftCard.heading}
          text={home.giftCard.body}
          ctaLabel={home.giftCard.cta}
          ctaHref="/gift-cards"
        />

        {!isAuthenticated && (
          <sky-feature-card
            color="surface-high"
            icon={home.memberBanner.icon}
            iconStyle="surface"
            headline={home.memberBanner.heading}
            text={home.memberBanner.body}
            ctaLabel={home.memberBanner.button}
            ctaHref={home.memberBanner.buttonLink}
          />
        )}
      </div>
    </section>
  );
}
