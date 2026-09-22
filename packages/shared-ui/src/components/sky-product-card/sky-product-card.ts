import { LitElement, html, css, nothing } from 'lit';
// Register the M3 elements this card composes (works even without the full barrel).
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import { alignment, coverImage, focusRing, hostBase, nextId, pill, typescale } from '../shared-styles.js';

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

  /** Per-instance id wiring aria-labelledby from the article to its heading. */
  private readonly _headingId = nextId('sky-product-heading');

  constructor() {
    super();
    this.variant = 'plain';
    this.favorite = false;
    this.favoriteActive = false;
    this.align = 'left';
  }

  static override styles = css`
    ${hostBase}
    ${alignment}
    ${typescale}
    ${coverImage}
    ${pill}
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
      border-radius: var(--md-sys-shape-corner-large);
      background-color: var(--md-sys-color-surface);
      transition: box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    }
    :host([variant='outlined']) .card {
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    .card:hover {
      box-shadow: var(--sky-elevation-2);
    }
    /* The heading link carries focus; the ring outlines the whole card it stretches over. */
    .card:has(.heading a:focus-visible) {
      ${focusRing}
    }
    .heading a:focus-visible {
      outline: none;
    }
    .media {
      aspect-ratio: 3 / 2;
    }
    .favorite {
      position: absolute;
      inset-block-start: 6px;
      inset-inline-end: 6px;
      z-index: 2;
      --md-icon-button-icon-color: var(--md-sys-color-on-surface);
      background-color: var(--md-sys-color-surface);
      border-radius: var(--md-sys-shape-corner-full);
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
      align-items: var(--_align);
      flex: 1;
      gap: 6px;
      padding: 12px 14px 14px;
      background-color: var(--md-sys-color-surface-container);
    }
    /* Slotted actions (e.g. "Add to Cart") get their own stacking context above the
       heading's stretched link (::after, z-index 1), or the link would swallow their clicks. */
    slot {
      display: block;
      margin-top: auto;
      position: relative;
      z-index: 2;
    }
    .tag,
    .meta,
    .rating,
    .score,
    .price {
      display: flex;
      align-items: center;
      justify-content: var(--_align);
      flex-wrap: wrap;
      gap: 6px;
      color: var(--md-sys-color-on-surface-variant);
    }
    .tag md-icon,
    .meta md-icon {
      --md-icon-size: 16px;
    }
    .tag md-icon {
      color: var(--md-sys-color-primary);
    }
    .eyebrow,
    .price__current,
    .price__discount,
    .price__note {
      color: var(--md-sys-color-primary);
    }
    /* Independently clickable link above the stretched card link. */
    a.eyebrow {
      position: relative;
      z-index: 2;
      text-decoration: none;
    }
    a.eyebrow:hover,
    a.eyebrow:focus-visible {
      text-decoration: underline;
    }
    a.eyebrow:focus-visible {
      ${focusRing}
    }
    .heading a {
      color: inherit;
      text-decoration: none;
    }
    /* Stretched link: the whole card is clickable, the favorite button stays separate. */
    .heading a::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    .meta {
      flex-wrap: nowrap;
      justify-content: space-between;
      inline-size: 100%;
    }
    :host([align='center']) .meta,
    :host([align='right']) .meta {
      justify-content: var(--_align);
    }
    .meta .distance {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      white-space: nowrap;
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
    .rating strong,
    .score__label {
      color: var(--md-sys-color-on-surface);
      font-weight: 600;
    }
    .score__badge {
      min-inline-size: 2rem;
      padding: 3px 6px;
      text-align: center;
      border-radius: var(--md-sys-shape-corner-small) var(--md-sys-shape-corner-small)
        var(--md-sys-shape-corner-small) 0;
      background-color: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .price {
      align-items: baseline;
      margin-top: 2px;
    }
    .price__original {
      text-decoration: line-through;
    }
    .price__current {
      font-weight: 700;
    }
    .price__discount {
      font-weight: 600;
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
      // role="img" makes the aria-label announce; aria-label on a plain <div> is ignored.
      return html`<div
        class="score body-medium"
        role="img"
        aria-label=${`Score ${this.score} out of 10${label ? `, ${label}` : ''}`}
      >
        <span class="score__badge label-large">${this.score}</span>
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
        class="rating body-medium"
        role="img"
        aria-label=${`Rated ${this.rating} out of 5${
          this.reviews != null ? `, ${this.reviews.toLocaleString()} reviews` : ''
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
              ? html`<span class="price__prefix body-medium">${this.pricePrefix}</span>`
              : nothing}
            ${this.originalPrice
            ? html`<span class="price__original body-medium">${this.originalPrice}</span>`
            : nothing}
            <data class="price__current title-medium" value=${this.price ?? ''}>${this.price}</data>
            ${this.discount
              ? html`<span class="price__discount body-medium">${this.discount}</span>`
              : nothing}
          </div>`
        : nothing}
      ${this.priceNote
        ? html`<div class="price__note body-medium">${this.priceNote}</div>`
        : nothing}
    `;
  }

  protected override render() {
    return html`
      <article class="card" aria-labelledby=${this.heading ? this._headingId : nothing}>
        <figure class="media">
          <slot name="media">
            ${this.image
              ? html`<img src=${this.image} alt=${this.imageAlt ?? ''} loading="lazy" decoding="async" />`
              : nothing}
          </slot>
          ${this.badge
            ? html`<span class="badge pill">${this.badge}</span>`
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
            ? html`<span class="tag label-medium"
                >${this.tagIcon
                  ? html`<md-icon aria-hidden="true">${this.tagIcon}</md-icon>`
                  : nothing}${this.tag}</span
              >`
            : nothing}
          ${this.eyebrow
        ? this.eyebrowHref
          ? html`<a
                class="eyebrow body-medium"
                href=${this.eyebrowHref}
                @click=${(e: Event) => e.stopPropagation()}
                >${this.eyebrow}</a
              >`
          : html`<span class="eyebrow body-medium">${this.eyebrow}</span>`
        : nothing}
          ${this.heading
        ? html`<h3 id=${this._headingId} class="heading title-medium">
                ${this.href
                  ? html`<a href=${this.href}>${this.heading}</a>`
                  : this.heading}
              </h3>`
            : nothing}
          ${this.location || this.distance
            ? html`<div class="meta body-medium">
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