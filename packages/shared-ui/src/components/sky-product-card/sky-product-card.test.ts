import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-product-card.js';
import { SkyProductCard } from './sky-product-card.js';

installMaterialJsdomPolyfills();

function createElement(): SkyProductCard {
  const el = document.createElement('sky-product-card') as SkyProductCard;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-product-card', () => {
  describe('renders', () => {
    it('renders with default props', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.variant).toBe('plain');
      expect(el.favorite).toBe(false);
      expect(el.align).toBe('left');
    });

    it('renders an article element as the root', async () => {
      const el = createElement();
      await el.updateComplete;
      const article = el.shadowRoot?.querySelector('article.card');
      expect(article).toBeTruthy();
    });

    it('renders image with alt from prop', async () => {
      const el = createElement();
      el.image = 'https://example.com/image.jpg';
      el.imageAlt = 'Spa treatment';
      await el.updateComplete;
      const img = el.shadowRoot?.querySelector('.media img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain('example.com/image.jpg');
      expect(img.alt).toBe('Spa treatment');
    });

    it('renders badge when badge prop is set', async () => {
      const el = createElement();
      el.badge = 'Popular Gift';
      await el.updateComplete;
      const badge = el.shadowRoot?.querySelector('.badge');
      expect(badge?.textContent?.trim()).toBe('Popular Gift');
    });

    it('renders heading', async () => {
      const el = createElement();
      el.heading = '90-minute massage';
      await el.updateComplete;
      const h3 = el.shadowRoot?.querySelector('h3.heading');
      expect(h3?.textContent?.trim()).toBe('90-minute massage');
    });

    it('renders price', async () => {
      const el = createElement();
      el.price = '$159';
      el.originalPrice = '$220';
      el.discount = '-28%';
      await el.updateComplete;
      const current = el.shadowRoot?.querySelector('.price__current');
      const original = el.shadowRoot?.querySelector('.price__original');
      const discount = el.shadowRoot?.querySelector('.price__discount');
      expect(current?.textContent?.trim()).toBe('$159');
      expect(original?.textContent?.trim()).toBe('$220');
      expect(discount?.textContent?.trim()).toBe('-28%');
    });

    it('renders eyebrow', async () => {
      const el = createElement();
      el.eyebrow = 'Just Relax Spa';
      await el.updateComplete;
      const eyebrow = el.shadowRoot?.querySelector('.eyebrow');
      expect(eyebrow?.textContent?.trim()).toBe('Just Relax Spa');
    });
  });

  describe('href prop', () => {
    it('renders an anchor inside heading when href is set', async () => {
      const el = createElement();
      el.heading = 'Great Massage';
      el.href = '/deals/123';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('h3.heading a') as HTMLAnchorElement;
      expect(anchor).toBeTruthy();
      expect(anchor.getAttribute('href')).toBe('/deals/123');
      expect(anchor.textContent?.trim()).toBe('Great Massage');
    });

    it('renders heading as plain text when href is not set', async () => {
      const el = createElement();
      el.heading = 'Great Massage';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('h3.heading a');
      expect(anchor).toBeNull();
    });
  });

  describe('favorite button', () => {
    it('renders favorite button when favorite prop is true', async () => {
      const el = createElement();
      el.favorite = true;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('md-icon-button.favorite');
      expect(btn).toBeTruthy();
    });

    it('does not render favorite button when favorite is false', async () => {
      const el = createElement();
      el.favorite = false;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('md-icon-button.favorite');
      expect(btn).toBeNull();
    });

    it('fires favorite CustomEvent when favorite button is clicked', async () => {
      const el = createElement();
      el.favorite = true;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('favorite', (e) => events.push(e as CustomEvent));

      const btn = el.shadowRoot?.querySelector('md-icon-button.favorite') as HTMLElement;
      btn?.click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0].detail).toHaveProperty('active');
    });

    it('toggles favoriteActive on each click', async () => {
      const el = createElement();
      el.favorite = true;
      el.favoriteActive = false;
      await el.updateComplete;

      const btn = el.shadowRoot?.querySelector('md-icon-button.favorite') as HTMLElement;
      btn?.click();
      await el.updateComplete;
      expect(el.favoriteActive).toBe(true);

      btn?.click();
      await el.updateComplete;
      expect(el.favoriteActive).toBe(false);
    });

    it('favorite button has accessible aria-label for add state', async () => {
      const el = createElement();
      el.favorite = true;
      el.favoriteActive = false;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('md-icon-button.favorite');
      expect(btn?.getAttribute('aria-label')).toBe('Add to favorites');
    });

    it('favorite button has accessible aria-label for remove state', async () => {
      const el = createElement();
      el.favorite = true;
      el.favoriteActive = true;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('md-icon-button.favorite');
      expect(btn?.getAttribute('aria-label')).toBe('Remove from favorites');
    });
  });

  describe('rating mode: stars', () => {
    it('renders rating div with aria-label when rating is set', async () => {
      const el = createElement();
      el.rating = 4.7;
      el.reviews = 783;
      await el.updateComplete;
      const ratingDiv = el.shadowRoot?.querySelector('.rating');
      expect(ratingDiv).toBeTruthy();
      expect(ratingDiv?.getAttribute('aria-label')).toContain('4.7');
      expect(ratingDiv?.getAttribute('aria-label')).toContain('783');
    });

    it('stars container is aria-hidden', async () => {
      const el = createElement();
      el.rating = 4;
      el.reviews = 100;
      await el.updateComplete;
      const stars = el.shadowRoot?.querySelector('.stars');
      expect(stars?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('rating mode: score badge', () => {
    it('renders score badge when score is set', async () => {
      const el = createElement();
      el.score = 8.5;
      el.scoreLabel = 'Excellent';
      el.reviews = 200;
      await el.updateComplete;
      const scoreBadge = el.shadowRoot?.querySelector('.score__badge');
      expect(scoreBadge).toBeTruthy();
      expect(scoreBadge?.textContent?.trim()).toBe('8.5');
    });

    it('score div has descriptive aria-label', async () => {
      const el = createElement();
      el.score = 9;
      el.scoreLabel = 'Outstanding';
      el.reviews = 50;
      await el.updateComplete;
      const scoreDiv = el.shadowRoot?.querySelector('.score');
      expect(scoreDiv?.getAttribute('aria-label')).toContain('9');
      expect(scoreDiv?.getAttribute('aria-label')).toContain('Outstanding');
    });

    it('does not render rating stars when score mode is active', async () => {
      const el = createElement();
      el.score = 8;
      el.scoreLabel = 'Great';
      await el.updateComplete;
      const stars = el.shadowRoot?.querySelector('.stars');
      expect(stars).toBeNull();
    });
  });

  describe('variant', () => {
    it('reflects outlined variant', async () => {
      const el = createElement();
      el.variant = 'outlined';
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('outlined');
    });
  });
});
