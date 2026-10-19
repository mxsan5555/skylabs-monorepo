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

  describe('layout', () => {
    it('defaults to vertical', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.layout).toBe('vertical');
    });

    it('reflects layout="horizontal" as an attribute', async () => {
      const el = createElement();
      el.layout = 'horizontal';
      await el.updateComplete;
      expect(el.getAttribute('layout')).toBe('horizontal');
    });
  });

  describe('slotted action content (e.g. Add to Cart)', () => {
    // Regression guard for a real click-through bug: the stretched link's `::after` (position:
    // absolute, inset: 0, z-index: 1) covers the whole card. Slotted content (an action button
    // passed as a child, e.g. "Add to Cart") must sit in its own stacking context ABOVE that
    // overlay, or clicks on it are intercepted by the invisible link and incorrectly navigate.
    // jsdom doesn't resolve shadow-DOM adoptedStyleSheets for `getComputedStyle`, so this asserts
    // directly on the component's own stylesheet source rather than a computed value.
    it('default slot rule sits above the stretched link in the stacking order', () => {
      const cssText = SkyProductCard.styles.toString();
      const slotRuleMatch = cssText.match(/slot:not\(\[name\]\)\s*\{[^}]*\}/);
      expect(slotRuleMatch).toBeTruthy();
      const slotRule = slotRuleMatch?.[0] ?? '';
      expect(slotRule).toContain('position: relative');
      const zIndexMatch = slotRule.match(/z-index:\s*(\d+)/);
      expect(zIndexMatch).toBeTruthy();
      expect(Number(zIndexMatch?.[1])).toBeGreaterThan(1); // above `.heading a::after`'s z-index: 1
    });
  });
});

describe('sky-product-card media', () => {
  async function card(props: Partial<SkyProductCard>) {
    const el = document.createElement('sky-product-card') as SkyProductCard;
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  it('styles only the default (action) slot as a block, so the media slot never shrinks the image', () => {
    const css = SkyProductCard.styles.toString();
    expect(css).toContain('slot:not([name])');
    expect(css).not.toMatch(/(^|\s|\})slot \{/);
  });

  it('swaps a broken image for a neutral placeholder', async () => {
    const el = await card({ image: '/missing.jpg', imageAlt: 'Designer Nail Art' });
    const query = (selector: string) => el.shadowRoot?.querySelector(selector) ?? null;
    query('img')?.dispatchEvent(new Event('error'));
    await el.updateComplete;
    expect(query('img')).toBeNull();
    expect(query('.media__placeholder')).not.toBeNull();
  });

  it('tries a new image again after a broken one', async () => {
    const el = await card({ image: '/missing.jpg' });
    const query = (selector: string) => el.shadowRoot?.querySelector(selector) ?? null;
    query('img')?.dispatchEvent(new Event('error'));
    await el.updateComplete;
    el.image = '/ok.jpg';
    await el.updateComplete;
    expect(query('img')?.getAttribute('src')).toBe('/ok.jpg');
  });
});

describe('sky-product-card badge-color', () => {
  async function card(props: Partial<SkyProductCard>) {
    const el = document.createElement('sky-product-card') as SkyProductCard;
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  it('keeps the default pill without badge-color', async () => {
    const el = await card({ image: '/a.jpg', badge: 'New' });
    expect(el.shadowRoot?.querySelector('span.badge.pill')?.textContent).toBe('New');
    expect(el.shadowRoot?.querySelector('sky-badge')).toBeNull();
  });

  it('draws the badge as a sky-badge in the chosen theme role', async () => {
    const el = await card({ image: '/a.jpg', badge: 'Expire soon', badgeColor: 'error' });
    const badge = el.shadowRoot?.querySelector('sky-badge.badge') as HTMLElement;
    expect(badge.getAttribute('variant')).toBe('error');
    expect(badge.textContent).toBe('Expire soon');
    expect(el.shadowRoot?.querySelector('.pill')).toBeNull();
  });

  it('uses the role container for badge-tone="tonal"', async () => {
    const el = await card({ image: '/a.jpg', badge: 'New', badgeColor: 'tertiary', badgeTone: 'tonal' });
    expect(el.shadowRoot?.querySelector('sky-badge')?.getAttribute('status')).toBe('warning');
  });
});

describe('sky-product-card color', () => {
  it('keeps the default look without color and reflects a chosen role', async () => {
    const el = document.createElement('sky-product-card') as SkyProductCard;
    el.heading = 'Kit';
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.hasAttribute('color')).toBe(false);
    el.color = 'secondary';
    await el.updateComplete;
    expect(el.getAttribute('color')).toBe('secondary');
  });

  it('maps the body, text and accents to the shared M3 roles only when color is set', () => {
    const css = SkyProductCard.styles.toString();
    expect(css).toContain(':host([color]) .body');
    expect(css).toMatch(/:host\(\[color\]\) \.price__current[^{]*\{[^}]*--_accent/);
    expect(css).toContain(":host([color='secondary'])");
    // Slotted actions (Add to cart, wishlist) follow the role too.
    expect(css).toMatch(/:host\(\[color\]\) slot:not\(\[name\]\)::slotted\(\*\)[^{]*\{[^}]*--md-outlined-icon-button-outline-color/);
  });
});

describe('sky-product-card description and price-first order', () => {
  async function card(props: Partial<SkyProductCard>) {
    const el = document.createElement('sky-product-card') as SkyProductCard;
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }
  const order = (el: SkyProductCard) =>
    Array.from(el.shadowRoot?.querySelector('.body')?.children ?? []).map((child) => (child.tagName === 'SLOT' ? 'SLOT' : child.className));

  it('shows the description under the heading', async () => {
    const el = await card({ heading: 'Hydro massage', description: 'Up to 89% off.' });
    const heading = el.shadowRoot?.querySelector('h3') as HTMLElement;
    expect(heading.nextElementSibling?.textContent).toBe('Up to 89% off.');
  });

  it('keeps the default order when price-first is off', async () => {
    const el = await card({ heading: 'Kit', eyebrow: 'Serenity', price: '₹25', rating: 4.7, reviews: 10 });
    expect(order(el)).toEqual(['eyebrow body-medium', 'heading title-medium', 'rating body-medium', 'price', 'SLOT']);
  });

  it('puts price and rating first, then heading + description + member, then the place row', async () => {
    const el = await card({
      priceFirst: true,
      heading: 'Hydro massage',
      description: 'Up to 89% off.',
      eyebrow: 'Delaware Injury Care',
      location: 'Lucknow',
      distance: '20 km',
      price: '₹25',
      originalPrice: '₹6,500',
      discount: '-60%',
      rating: 4.7,
      reviews: 4273,
    });
    expect(el.hasAttribute('price-first')).toBe(true);
    expect(order(el)).toEqual(['meta', 'group', 'meta body-medium', 'SLOT']);
    const [priceRow, textGroup, placeRow] = Array.from(el.shadowRoot?.querySelector('.body')?.children ?? []);
    // Heading and description clamp to two lines (ellipsis) in this order.
    expect(Array.from(textGroup.children).map((c) => c.className)).toEqual(['heading title-medium clamp', 'body-medium clamp', 'meta']);
    // The member sits last in its row (pushed to the end by an empty start item).
    expect(textGroup.lastElementChild?.lastElementChild?.textContent).toBe('Delaware Injury Care');
    expect(priceRow.querySelector('.price .price__current')?.textContent).toBe('₹25');
    expect(priceRow.querySelector('.rating')?.getAttribute('aria-label')).toBe('Rated 4.7 out of 5, 4,273 reviews');
    // Current price first, one star and a grouped review count.
    expect(priceRow.querySelector('.price')?.firstElementChild?.textContent).toBe('₹25');
    expect(priceRow.querySelector('.price__current')?.classList.contains('title-large')).toBe(true);
    // One star and the score; the review count is in the accessible name only.
    expect(priceRow.querySelectorAll('.stars md-icon')).toHaveLength(1);
    expect(priceRow.querySelector('.rating')?.textContent?.trim()).toMatch(/4.7$/);
    expect(placeRow.textContent).toContain('Lucknow');
    expect(placeRow.querySelector('.distance')?.textContent).toContain('20 km');
  });
});
