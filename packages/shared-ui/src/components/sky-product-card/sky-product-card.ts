import { LitElement, html, css, nothing } from 'lit';
// Register the M3 elements this card composes (works even without the full barrel).
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import { hostBase } from '../shared-styles.js';

/**
 * <sky-product-card> — rich listing card (deal / hotel / product).
 *
 * Built with LIT (decorator-free) and composed from Material 3 web components
 * (`md-icon`, `md-icon-button`). Themed by `--md-sys-color-*`, so price, discount
 * and the score badge adopt each app's brand. All inputs are primitive props, so
 * usage is identical in React (msd) and Angular (mera-driver) as plain attributes.
 *
 * Rating has two mutually-exclusive styles: pass `rating`+`reviews` for stars, or
 * `score`+`score-label`+`reviews` for a score badge (hotel style).
 *
 * @example
 * <sky-product-card
 *   image="…" eyebrow="Just Relax Spa"
 *   heading="90-minute VIP facial and body massage"
 *   location="Center City East, Philadelphia" distance="11 mi"
 *   rating="4.7" reviews="783"
 *   original-price="$220" price="$159" discount="-28%"
 *   price-note="$119.25 with code SUMMER" badge="Popular Gift" favorite>
 * </sky-product-card>
 */
export class SkyProductCard extends LitElement {
  static override properties = {
    image: { type: String },
    imageAlt: { type: String, attribute: 'image-alt' },
    variant: { type: String, reflect: true },
    badge: { type: String },
    favorite: { type: Boolean },
    favoriteActive: { type: Boolean, attribute: 'favorite-active', reflect: true },
    tag: { type: String },
    tagIcon: { type: String, attribute: 'tag-icon' },
    eyebrow: { type: String },
    eyebrowHref: { type: String, attribute: 'eyebrow-href' },
    heading: { type: String },
    location: { type: String },
    distance: { type: String },
    rating: { type: Number },
    reviews: { type: Number },
    score: { type: Number },
    scoreLabel: { type: String, attribute: 'score-label' },
    price: { type: String },
    originalPrice: { type: String, attribute: 'original-price' },
    discount: { type: String },
    pricePrefix: { type: String, attribute: 'price-prefix' },
    priceNote: { type: String, attribute: 'price-note' },
    href: { type: String },
    align: { type: String, reflect: true },
  };

  declare image?: string;
  declare imageAlt?: string;
  /** Surface style: 'plain' (default) | 'outlined' (bordered). */
  declare variant: 'plain' | 'outlined';
  declare badge?: string;
  declare favorite: boolean;
  declare favoriteActive: boolean;
  declare tag?: string;
  declare tagIcon?: string;
  declare eyebrow?: string;
  /** Optional link target for the eyebrow (e.g. vendor storefront). Renders the
   * eyebrow as its own anchor, independent of the card's stretched-link href. */
  declare eyebrowHref?: string;
  declare heading?: string;
  declare location?: string;
  declare distance?: string;
  declare rating?: number;
  declare reviews?: number;
  declare score?: number;
  declare scoreLabel?: string;
  declare price?: string;
  declare originalPrice?: string;
  declare discount?: string;
  declare pricePrefix?: string;
  declare priceNote?: string;
  declare href?: string;
  /** Content alignment: 'left' (default) | 'center' | 'right'. */
  declare align: 'left' | 'center' | 'right';

  /** Per-instance ID used to wire aria-labelledby from article → heading. */
  private readonly _uid = Math.random().toString(36).slice(2, 8);

  constructor() {
    super();
    this.variant = 'plain';
    this.favorite = false;
    this.favoriteActive = false;
    this.align = 'left';
  }

  static override styles = css`
    ${hostBase}
    :host {
      display: flex;
      flex-direction: column;
    }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      border-radius: var(--md-sys-shape-corner-large, 16px);
      background-color: var(--md-sys-color-surface);
      transition: box-shadow 150ms ease;
    }
    :host([variant='outlined']) .card {
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    .card:hover {
      box-shadow:
        0 1px 2px color-mix(in srgb, var(--md-sys-color-shadow) 30%, transparent),
        0 2px 6px 2px color-mix(in srgb, var(--md-sys-color-shadow) 15%, transparent);
    }
    .media {
      position: relative;
      margin: 0; /* reset <figure> UA default margin */
      aspect-ratio: 3 / 2;
      background-color: var(--md-sys-color-surface-variant);
    }
    .media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .media swiper-container {
      width: 100%;
      height: 100%;
      --swiper-theme-color: var(--md-sys-color-primary);
      --swiper-navigation-color: var(--md-sys-color-primary);
    }

    .media swiper-slide {
      display: flex;
    }

    .media swiper-slide img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .media::part(button-prev),
    .media::part(button-next) {
      color: var(--md-sys-color-on-primary-container);
      width: 32px;
      height: 32px;
    }

    .media::part(pagination) {
      bottom: 8px;
    }
    .badge {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 2;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 999px;
      background-color: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .favorite {
      position: absolute;
      top: 6px;
      right: 6px;
      z-index: 2;
      --md-icon-button-icon-color: var(--md-sys-color-on-surface);
      background-color: var(--md-sys-color-surface);
      border-radius: 999px;
    }
    :host([favorite-active]) .favorite {
      --md-icon-button-icon-color: var(--md-sys-color-error);
    }
    :host([favorite-active]) .favorite md-icon {
      font-variation-settings: 'FILL' 1;
    }
    .body {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 6px;
      padding: 12px 14px 14px;
      background: var(--md-sys-color-surface-container);
    }
    slot {
      display: block;
      margin-top: auto;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface-variant);
    }
    .tag md-icon {
      --md-icon-size: 16px;
      color: var(--md-sys-color-primary);
    }
    .eyebrow {
      font-size: 0.8125rem;
      color: var(--md-sys-color-primary);
    }
    /* Own stacking context above the heading's stretched link (z-index: 1),
       same technique as .favorite: an independently-clickable sibling that
       resolves its own href instead of falling through to the card link. */
    a.eyebrow {
      position: relative;
      z-index: 2;
      display: inline-block;
      text-decoration: none;
    }
    a.eyebrow:hover,
    a.eyebrow:focus-visible {
      text-decoration: underline;
    }
    .heading {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .heading a {
      color: inherit;
      text-decoration: none;
    }
    /* Stretched link: makes the whole card clickable while keeping the favorite
       button (a sibling with higher z-index) independently interactive. */
    .heading a::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    .card:focus-within {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.8125rem;
      color: var(--md-sys-color-on-surface-variant);
    }
    .meta .distance {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      white-space: nowrap;
    }
    .meta md-icon {
      --md-icon-size: 16px;
    }
    .rating {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8125rem;
      color: var(--md-sys-color-on-surface-variant);
    }
    .stars {
      display: inline-flex;
      color: var(--md-sys-color-primary);
    }
    .stars md-icon {
      --md-icon-size: 18px;
      font-variation-settings: 'FILL' 1;
    }
    .stars md-icon.empty {
      font-variation-settings: 'FILL' 0;
      color: var(--md-sys-color-outline);
    }
    .rating strong {
      color: var(--md-sys-color-on-surface);
    }
    .score {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8125rem;
      color: var(--md-sys-color-on-surface-variant);
    }
    .score__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2rem;
      padding: 3px 6px;
      border-radius: 8px 8px 8px 0;
      background-color: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .score__label {
      color: var(--md-sys-color-on-surface);
      font-weight: 600;
    }
    .price {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
    }
    .price__prefix {
      font-size: 0.8125rem;
      color: var(--md-sys-color-on-surface-variant);
    }
    .price__original {
      font-size: 0.875rem;
      text-decoration: line-through;
      color: var(--md-sys-color-on-surface-variant);
    }
    .price__current {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--md-sys-color-primary);
    }
    .price__discount {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--md-sys-color-primary);
    }
    .price__note {
      font-size: 0.8125rem;
      color: var(--md-sys-color-primary);
    }

    /* Content alignment (default left). */
    :host([align='center']) .body {
      align-items: center;
      text-align: center;
    }
    :host([align='center']) .meta,
    :host([align='center']) .price,
    :host([align='center']) .rating,
    :host([align='center']) .score,
    :host([align='center']) .tag {
      justify-content: center;
    }
    :host([align='right']) .body {
      align-items: flex-end;
      text-align: right;
    }
    :host([align='right']) .meta,
    :host([align='right']) .price,
    :host([align='right']) .rating,
    :host([align='right']) .score,
    :host([align='right']) .tag {
      justify-content: flex-end;
    }
  `;

  private _toggleFavorite(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    this.favoriteActive = !this.favoriteActive;
    this.dispatchEvent(
      new CustomEvent('favorite', {
        detail: { active: this.favoriteActive },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderStars() {
    const filled = Math.round(this.rating ?? 0);
    return html`<span class="stars" aria-hidden="true"
      >${[0, 1, 2, 3, 4].map((i) =>
        i < filled
          ? html`<md-icon>star</md-icon>`
          : html`<md-icon class="empty">star</md-icon>`,
      )}</span
    >`;
  }

  private _renderRating() {
    if (this.score != null) {
      const label = [
        this.scoreLabel,
        this.reviews != null
          ? `${this.reviews.toLocaleString()} reviews`
          : undefined,
      ]
        .filter(Boolean)
        .join(', ');
      return html`<div
        class="score"
        aria-label=${`Score ${this.score} out of 10${label ? `, ${label}` : ''}`}
      >
        <span class="score__badge">${this.score}</span>
        ${this.scoreLabel
          ? html`<span class="score__label">${this.scoreLabel}</span>`
          : nothing}
        ${this.reviews != null
          ? html`<span>${this.reviews.toLocaleString()} reviews</span>`
          : nothing}
      </div>`;
    }
    if (this.rating != null) {
      return html`<div
        class="rating"
        aria-label=${`Rated ${this.rating} out of 5${
          this.reviews != null ? `, ${this.reviews} reviews` : ''
        }`}
      >
        ${this._renderStars()}
        <span><strong>${this.rating}</strong> (${this.reviews ?? 0})</span>
      </div>`;
    }
    return nothing;
  }

  private _renderPrice() {
    if (!this.price && !this.priceNote) return nothing;
    return html`
      ${this.price
        ? html`<div class="price">
            ${this.pricePrefix
              ? html`<span class="price__prefix">${this.pricePrefix}</span>`
              : nothing}
            ${this.originalPrice
            ? html`<span class="price__original">${this.originalPrice}</span>`
            : nothing}
            <data class="price__current" value=${this.price ?? ''}>${this.price}</data>
            ${this.discount
              ? html`<span class="price__discount">${this.discount}</span>`
              : nothing}
          </div>`
        : nothing}
      ${this.priceNote
        ? html`<div class="price__note">${this.priceNote}</div>`
        : nothing}
    `;
  }

  protected override render() {
    return html`
      <article class="card" aria-labelledby=${this.heading ? `${this._uid}-heading` : nothing}>
        <figure class="media">
          <slot name="media">
            ${this.image
              ? html`<img src=${this.image} alt=${this.imageAlt ?? ''} />`
              : nothing}
          </slot>
          ${this.badge
            ? html`<span class="badge">${this.badge}</span>`
            : nothing}
          ${this.favorite
            ? html`<md-icon-button
                class="favorite"
                aria-label=${this.favoriteActive
                  ? 'Remove from favorites'
                  : 'Add to favorites'}
                aria-pressed=${this.favoriteActive ? 'true' : 'false'}
                @click=${this._toggleFavorite}
              >
                <md-icon>favorite</md-icon>
              </md-icon-button>`
        : nothing}
        </figure>
        <div class="body">
          ${this.tag
            ? html`<span class="tag"
                >${this.tagIcon
                  ? html`<md-icon aria-hidden="true">${this.tagIcon}</md-icon>`
                  : nothing}${this.tag}</span
              >`
            : nothing}
          ${this.eyebrow
        ? this.eyebrowHref
          ? html`<a
                class="eyebrow"
                href=${this.eyebrowHref}
                @click=${(e: Event) => e.stopPropagation()}
                >${this.eyebrow}</a
              >`
          : html`<span class="eyebrow">${this.eyebrow}</span>`
        : nothing}
          ${this.heading
        ? html`<h3 id=${`${this._uid}-heading`} class="heading">
                ${this.href
                  ? html`<a href=${this.href}>${this.heading}</a>`
                  : this.heading}
              </h3>`
            : nothing}
          ${this.location || this.distance
            ? html`<div class="meta">
                <span>${this.location}</span>
                ${this.distance
                  ? html`<span class="distance"
                      ><md-icon aria-hidden="true">near_me</md-icon
                      >${this.distance}</span
                    >`
                  : nothing}
              </div>`
            : nothing}
          ${this._renderRating()} ${this._renderPrice()}
          <slot></slot>
        </div>
      </article>
    `;
  }
}

if (!customElements.get('sky-product-card')) {
  customElements.define('sky-product-card', SkyProductCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-product-card': SkyProductCard;
  }
}