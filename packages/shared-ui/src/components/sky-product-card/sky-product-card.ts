import { LitElement, html, css, nothing } from 'lit';
// Register the M3 elements this card composes (works even without the full barrel).
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import {
  alignment,
  coverImage,
  focusRing,
  hostBase,
  lineClamp,
  mediaCorner,
  nextId,
  pill,
  typescale,
} from '../shared-styles.js';
import { mediaPlaceholder, mediaPlaceholderStyles } from '../media-placeholder.js';
import { actionRoles, colorRoles, type SkyColor } from '../m3-surface.js';
import '../sky-badge/sky-badge.js';

/** badge-tone="tonal": sky-badge's status tone for each role, i.e. that role's container pair. */
const TONAL_STATUS = { primary: 'success', secondary: 'info', tertiary: 'warning', error: 'error' } as const;

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
 * `layout="horizontal"`: media left, content right; stacks when the card is narrower than 600px.
 *
 * `description`: supporting text under the heading.
 * `badge-color`: primary | secondary | tertiary | error. Draws the badge as a `sky-badge` in that
 * theme role (filled role + its on-colour); without it the badge keeps the default primary pill.
 * `badge-tone="tonal"`: the role's container instead (sky-badge status tones), for a lighter tag.
 * `color`: none | surface | surface-high | primary | secondary | tertiary | inverse, the same M3
 * role vocabulary as sky-feature-card (`m3-surface.ts`): body fill, text and accents (price,
 * discount, eyebrow, stars, icons) follow the role. Unset keeps the default surface look.
 * `price-first`: offer order, grouped by proximity; heading and description keep two lines each
 * (ellipsis past that), so cards side by side stay aligned. Price (title-large) and a one-star
 * score share the first row; heading, description and the eyebrow (e.g. the member, right-aligned) form one
 * group; location (with a pin) and distance share the next row; slotted actions last, spanning
 * the card, set further apart.
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
    color: { type: String, reflect: true },
    badge: { type: String },
    badgeColor: { type: String, attribute: 'badge-color' },
    badgeTone: { type: String, attribute: 'badge-tone' },
    favorite: { type: Boolean },
    favoriteActive: { type: Boolean, attribute: 'favorite-active', reflect: true },
    tag: { type: String },
    tagIcon: { type: String, attribute: 'tag-icon' },
    eyebrow: { type: String },
    eyebrowHref: { type: String, attribute: 'eyebrow-href' },
    heading: { type: String },
    description: { type: String },
    priceFirst: { type: Boolean, attribute: 'price-first', reflect: true },
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
    layout: { type: String, reflect: true },
    imageFailed: { state: true },
  };

  declare image?: string;
  declare imageAlt?: string;
  /** Surface style: 'plain' (default) | 'outlined' (bordered). */
  declare variant: 'plain' | 'outlined';
  /** M3 colour role for the body (see class docs); unset keeps the default surface look. */
  declare color?: SkyColor;
  declare badge?: string;
  /** Theme role for the badge (see class docs); unset keeps the default primary pill. */
  declare badgeColor?: 'primary' | 'secondary' | 'tertiary' | 'error';
  /** `tonal`: the role's container colours (default: filled). */
  declare badgeTone?: 'filled' | 'tonal';
  declare favorite: boolean;
  declare favoriteActive: boolean;
  declare tag?: string;
  declare tagIcon?: string;
  declare eyebrow?: string;
  /** Optional link target for the eyebrow (e.g. vendor storefront). Renders the
   * eyebrow as its own anchor, independent of the card's stretched-link href. */
  declare eyebrowHref?: string;
  declare heading?: string;
  /** Supporting text under the heading. */
  declare description?: string;
  /** Offer order: price and rating first, member and location after the text (see class docs). */
  declare priceFirst: boolean;
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
  /** Card layout: 'vertical' (default) | 'horizontal' (media left, content right; stacks under
   *  600px of the card's own inline size). */
  declare layout: 'vertical' | 'horizontal';
  /** The image URL failed to load: show the neutral placeholder instead of a broken image. */
  declare imageFailed: boolean;

  /** Per-instance id wiring aria-labelledby from the article to its heading. */
  private readonly _headingId = nextId('sky-product-heading');

  constructor() {
    super();
    this.variant = 'plain';
    this.favorite = false;
    this.favoriteActive = false;
    this.align = 'left';
    this.layout = 'vertical';
    this.priceFirst = false;
    this.imageFailed = false;
  }

  protected override willUpdate(changed: Map<string, unknown>) {
    // A new image gets a fresh try.
    if (changed.has('image')) this.imageFailed = false;
  }

  static override styles = css`
    ${hostBase}
    ${alignment}
    ${typescale}
    ${coverImage}
    ${mediaPlaceholderStyles}
    ${pill}
    ${lineClamp}
    ${colorRoles}
    :host {
      display: flex;
      flex-direction: column;
      container-type: inline-size;
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
    @container (min-width: 600px) {
      :host([layout='horizontal']) .card {
        flex-direction: row;
      }
      :host([layout='horizontal']) .media {
        flex: 0 0 40%;
        min-inline-size: 160px;
        aspect-ratio: auto;
      }
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
    slot:not([name]) {
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
    /* price-first groups by proximity: 8px inside the text group (title, description, member on the
       right), 16px between sections (price row, text, place row), 28px before the actions, even
       16px padding (4dp grid). The member row reuses .meta: an empty start item pushes it right. */
    :host([price-first]) .body {
      gap: 16px;
      padding: 16px;
    }
    .group {
      display: flex;
      flex-direction: column;
      align-self: stretch;
      align-items: var(--_align);
      gap: 8px;
    }
    :host([price-first]) slot:not([name]) {
      padding-block-start: 12px;
    }
    :host([price-first]) .price {
      margin-top: 0;
    }
    /* badge-color: sky-badge owns the colours; it only takes the pill's place on the image. */
    sky-badge.badge {
      ${mediaCorner}
    }
    /* color: the shared M3 roles (m3-surface.ts) take over the body, its text and accents. Only
       when the attribute is set, so cards without it keep the default look. */
    :host([color]) .card,
    :host([color]) .body {
      background-color: var(--_container);
      color: var(--_on);
    }
    :host([color][variant='outlined']) .card {
      border-color: var(--_outline);
    }
    :host([color]) .tag,
    :host([color]) .meta,
    :host([color]) .rating,
    :host([color]) .score,
    :host([color]) .price,
    :host([color]) .stars md-icon.empty {
      color: var(--_on-variant);
    }
    :host([color]) .rating strong,
    :host([color]) .score__label {
      color: var(--_on);
    }
    :host([color]) .eyebrow,
    :host([color]) .price__current,
    :host([color]) .price__discount,
    :host([color]) .price__note,
    :host([color]) .stars,
    :host([color]) .tag md-icon {
      color: var(--_accent);
    }
    :host([color]) .score__badge {
      background-color: var(--_accent);
      color: var(--_on-accent);
    }
    :host([color]) slot:not([name])::slotted(*) {
      ${actionRoles}
    }
    /* The place keeps its pin on the first line; a long area name wraps beside it. */
    :host([price-first]) .meta .tag {
      flex-wrap: nowrap;
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
      // price-first shows one star and the score ("4.5"), to share a row with the price; the
      // review count stays in the accessible name.
      return html`<div
        class="rating body-medium"
        role="img"
        aria-label=${`Rated ${this.rating} out of 5${
          this.reviews != null ? `, ${this.reviews.toLocaleString()} reviews` : ''
        }`}
      >
        ${this.priceFirst
          ? html`<span class="stars" aria-hidden="true"><md-icon>star</md-icon></span>`
          : this._renderStars()}
        ${this.priceFirst
          ? html`<strong>${this.rating}</strong>`
          : html`<span><strong>${this.rating}</strong> (${this.reviews ?? 0})</span>`}
      </div>`;
    }
    return nothing;
  }

  private _renderPrice() {
    if (!this.price && !this.priceNote) return nothing;
    // price-first reads current, old, discount; the default order is old, current, discount.
    const current = html`<data class="price__current ${this.priceFirst ? 'title-large' : 'title-medium'}" value=${this.price ?? ''}
      >${this.price}</data
    >`;
    return html`
      ${this.price
        ? html`<div class="price">
            ${this.pricePrefix
              ? html`<span class="price__prefix body-medium">${this.pricePrefix}</span>`
              : nothing}
            ${this.priceFirst ? current : nothing}
            ${this.originalPrice
            ? html`<s class="price__original body-medium">${this.originalPrice}</s>`
            : nothing}
            ${this.priceFirst ? nothing : current}
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

  private _renderTag() {
    return this.tag
      ? html`<span class="tag label-medium"
          >${this.tagIcon ? html`<md-icon aria-hidden="true">${this.tagIcon}</md-icon>` : nothing}${this.tag}</span
        >`
      : nothing;
  }

  private _renderEyebrow() {
    if (!this.eyebrow) return nothing;
    return this.eyebrowHref
      ? html`<a class="eyebrow body-medium" href=${this.eyebrowHref} @click=${(e: Event) => e.stopPropagation()}
          >${this.eyebrow}</a
        >`
      : html`<span class="eyebrow body-medium">${this.eyebrow}</span>`;
  }

  private _renderHeading() {
    return this.heading
      ? html`<h3 id=${this._headingId} class=${this.priceFirst ? 'heading title-medium clamp' : 'heading title-medium'}>
          ${this.href ? html`<a href=${this.href}>${this.heading}</a>` : this.heading}
        </h3>`
      : nothing;
  }

  private _renderDescription() {
    return this.description
      ? html`<p class=${this.priceFirst ? 'body-medium clamp' : 'body-medium'}>${this.description}</p>`
      : nothing;
  }

  private _renderDistance() {
    return this.distance
      ? html`<span class="distance"><md-icon aria-hidden="true">near_me</md-icon>${this.distance}</span>`
      : nothing;
  }

  /** Offer order (`price-first`): see the class docs. */
  private _renderPriceFirstBody() {
    const hasPrice = this.price || this.priceNote;
    const hasRating = this.rating != null || this.score != null;
    return html`
      ${this._renderTag()}
      ${hasPrice || hasRating ? html`<div class="meta">${this._renderPrice()} ${this._renderRating()}</div>` : nothing}
      ${this.heading || this.description || this.eyebrow
        ? html`<div class="group">
            ${this._renderHeading()} ${this._renderDescription()}
            ${this.eyebrow
              ? // .meta spreads its items; the empty first item puts the eyebrow at the end.
                html`<div class="meta"><span></span>${this._renderEyebrow()}</div>`
              : nothing}
          </div>`
        : nothing}
      ${this.location || this.distance
        ? html`<div class="meta body-medium">
            ${this.location
              ? html`<span class="tag"><md-icon aria-hidden="true">location_on</md-icon>${this.location}</span>`
              : nothing}
            ${this._renderDistance()}
          </div>`
        : nothing}
    `;
  }

  protected override render() {
    return html`
      <article class="card" aria-labelledby=${this.heading ? this._headingId : nothing}>
        <figure class="media">
          <slot name="media">
            ${this.image && !this.imageFailed
              ? html`<img
                  src=${this.image}
                  alt=${this.imageAlt ?? ''}
                  loading="lazy"
                  decoding="async"
                  @error=${() => (this.imageFailed = true)}
                />`
              : nothing}
            ${this.image && this.imageFailed
              ? mediaPlaceholder
              : nothing}
          </slot>
          ${this.badge
            ? this.badgeColor
              ? html`<sky-badge
                  class="badge"
                  variant=${this.badgeColor}
                  status=${this.badgeTone === 'tonal' ? TONAL_STATUS[this.badgeColor] : nothing}
                  size="large"
                  >${this.badge}</sky-badge
                >`
              : html`<span class="badge pill">${this.badge}</span>`
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
          ${this.priceFirst
            ? this._renderPriceFirstBody()
            : html`
                ${this._renderTag()} ${this._renderEyebrow()} ${this._renderHeading()} ${this._renderDescription()}
                ${this.location || this.distance
                  ? html`<div class="meta body-medium"><span>${this.location}</span>${this._renderDistance()}</div>`
                  : nothing}
                ${this._renderRating()} ${this._renderPrice()}
              `}
          <!-- price-first: .meta gives the actions slot the full width, so a row can reach the end. -->
          <slot class=${this.priceFirst ? 'meta' : nothing}></slot>
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