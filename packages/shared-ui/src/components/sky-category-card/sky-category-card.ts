import { LitElement, html, css, nothing } from 'lit';
import { alignment, coverImage, hostBase, pill, stretchLink, typescale } from '../shared-styles.js';

/**
 * <sky-category-card> — rounded image, then heading + subheading below.
 *
 * Semantic `<figure>` (image) + `<figcaption>` (`<h3>` heading + `<p>` subheading),
 * transparent background. When `href` is set a stretched link (labelled from the
 * heading) makes the whole tile one focusable link. Presentational LIT element
 * (decorator-free), themed by `--md-sys-color-*`, fluid. Primitive props →
 * identical usage in React/Angular.
 *
 * @example
 * <sky-category-card image="…" image-alt="Hollywood sign"
 *   heading="Los Angeles" subheading="4,781 properties"
 *   href="/city/los-angeles" align="left"></sky-category-card>
 */
export class SkyCategoryCard extends LitElement {
  static override properties = {
    image: { type: String },
    imageAlt: { type: String, attribute: 'image-alt' },
    heading: { type: String },
    subheading: { type: String },
    href: { type: String },
    align: { type: String, reflect: true },
    tag: { type: String },
  };

  declare image?: string;
  declare imageAlt?: string;
  declare heading?: string;
  declare subheading?: string;
  declare href?: string;
  /** Optional Popular Tag label (e.g. "Trending") shown as a pill over the image — same visual
   *  treatment as `sky-product-card`'s own `badge`. Omitted entirely when unset. */
  declare tag?: string;
  /** Content alignment: 'left' (default) | 'center' | 'right'. */
  declare align: 'left' | 'center' | 'right';

  constructor() {
    super();
    this.align = 'left';
  }

  static override styles = css`
    ${hostBase}
    ${alignment}
    ${typescale}
    ${coverImage}
    ${pill}
    ${stretchLink}
    .card {
      position: relative;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .media {
      aspect-ratio: 1 / 1;
      border-radius: var(--md-sys-shape-corner-large);
    }
    .media img {
      transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    }
    .card:hover .media img {
      transform: scale(1.04);
    }
    figcaption {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .subheading {
      color: var(--md-sys-color-on-surface-variant);
    }
  `;

  protected override render() {
    return html`
      <figure class="card">
        <div class="media">
          ${this.image
            ? html`<img src=${this.image} alt=${this.imageAlt ?? ''} loading="lazy" decoding="async" />`
            : nothing}
          ${this.tag ? html`<span class="tag pill">${this.tag}</span>` : nothing}
        </div>
        ${this.heading || this.subheading
          ? html`<figcaption>
              ${this.heading
                ? html`<h3 class="heading title-medium">${this.heading}</h3>`
                : nothing}
              ${this.subheading
                ? html`<p class="subheading body-medium">${this.subheading}</p>`
                : nothing}
            </figcaption>`
          : nothing}
        ${this.href
          ? html`<a
              class="stretch"
              href=${this.href}
              aria-label=${this.heading ?? this.imageAlt ?? 'View'}
            ></a>`
          : nothing}
        <slot></slot>
      </figure>
    `;
  }
}

if (!customElements.get('sky-category-card')) {
  customElements.define('sky-category-card', SkyCategoryCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-category-card': SkyCategoryCard;
  }
}
