import { LitElement, html, css, nothing } from 'lit';
import { alignment, coverImage, hostBase, stretchLink, typescale } from '../shared-styles.js';

/**
 * <sky-image-card> — full-bleed image with a bottom overlay label.
 *
 * Semantic `<figure>` + `<figcaption>`. When `href` is set, a stretched link
 * (labelled from `label`/`image-alt`) makes the whole tile a single focusable
 * link. Presentational LIT element (decorator-free), themed by `--md-sys-color-*`,
 * fluid (fills its container). Primitive props → identical usage in React/Angular.
 *
 * @example
 * <sky-image-card image="…" image-alt="Cottage garden" label="Cottages"
 *   href="/stays/cottages" align="left"></sky-image-card>
 */
export class SkyImageCard extends LitElement {
  static override properties = {
    image: { type: String },
    imageAlt: { type: String, attribute: 'image-alt' },
    label: { type: String },
    href: { type: String },
    ratio: { type: String },
    align: { type: String, reflect: true },
  };

  declare image?: string;
  declare imageAlt?: string;
  declare label?: string;
  declare href?: string;
  /** Aspect ratio, any CSS `aspect-ratio` value. Defaults to a portrait tile. */
  declare ratio: string;
  /** Label alignment: 'left' (default) | 'center' | 'right'. */
  declare align: 'left' | 'center' | 'right';

  constructor() {
    super();
    this.ratio = '3 / 4';
    this.align = 'left';
  }

  static override styles = css`
    ${hostBase}
    ${alignment}
    ${typescale}
    ${coverImage}
    ${stretchLink}
    .card {
      border-radius: var(--md-sys-shape-corner-large);
      aspect-ratio: var(--_ratio);
    }
    /* Scrim keeps the label readable on any photo, in light and dark themes. */
    .card::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        color-mix(in srgb, var(--md-sys-color-scrim) 70%, transparent) 0%,
        transparent 55%
      );
    }
    .label {
      position: absolute;
      inset-inline: 14px;
      inset-block-end: 12px;
      z-index: 1;
      color: var(--sky-color-on-scrim);
      text-shadow: 0 1px 3px var(--md-sys-color-scrim);
    }
  `;

  protected override render() {
    const style = `--_ratio:${this.ratio}`;
    return html`
      <figure class="card media" style=${style}>
        ${this.image
          ? html`<img src=${this.image} alt=${this.imageAlt ?? ''} loading="lazy" decoding="async" />`
          : nothing}
        ${this.label
          ? html`<figcaption class="label title-large">${this.label}</figcaption>`
          : nothing}
        ${this.href
          ? html`<a
              class="stretch"
              href=${this.href}
              aria-label=${this.label ?? this.imageAlt ?? 'View'}
            ></a>`
          : nothing}
        <slot></slot>
      </figure>
    `;
  }
}

if (!customElements.get('sky-image-card')) {
  customElements.define('sky-image-card', SkyImageCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-image-card': SkyImageCard;
  }
}
