import { LitElement, html, css, nothing } from 'lit';
import { hostBase, stretchLink } from '../shared-styles.js';

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
    .card {
      position: relative;
      margin: 0;
      display: block;
      overflow: hidden;
      border-radius: var(--md-sys-shape-corner-large, 16px);
      aspect-ratio: var(--_ratio, 3 / 4);
      background-color: var(--md-sys-color-surface-variant);
    }
    .card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .card::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        color-mix(in srgb, var(--md-sys-color-scrim) 55%, transparent) 0%,
        transparent 45%
      );
    }
    .label {
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 12px;
      z-index: 1;
      color: var(--md-sys-color-surface);
      font-size: 1.15rem;
      font-weight: 700;
      text-shadow: 0 1px 3px color-mix(in srgb, var(--md-sys-color-scrim) 40%, transparent);
    }
    :host([align='center']) .label {
      text-align: center;
    }
    :host([align='right']) .label {
      text-align: right;
    }
    /* Stretched link: covers the figure, carries the accessible name. */
    ${stretchLink}
  `;

  protected override render() {
    const style = `--_ratio:${this.ratio}`;
    return html`
      <figure class="card" style=${style}>
        ${this.image
          ? html`<img src=${this.image} alt=${this.imageAlt ?? ''} />`
          : nothing}
        ${this.label
          ? html`<figcaption class="label">${this.label}</figcaption>`
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
