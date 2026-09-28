import { LitElement, html, css, nothing } from 'lit';
import '@material/web/icon/icon.js';
import '@material/web/ripple/ripple.js';
import '@material/web/focus/md-focus-ring.js';
import { hostBase } from '../shared-styles.js';
import { cardVariants, colorRoles, shapeScale, type SkyColor, type SkyShape, type SkyVariant } from '../m3-surface.js';

/**
 * <sky-image> — framed image (logo, thumbnail, photo) with a placeholder and an optional link.
 *
 * Renders a `<figure>` at a fixed `ratio`. With no `src` (or a failed load) it shows an M3
 * placeholder icon on the container colour, so layouts never collapse. With `href` the whole
 * frame becomes one link with the M3 state layer (md-ripple) and focus ring.
 *
 * @example
 * <sky-image src="/logo.png" alt="My Spa Deal" fit="contain" ratio="3 / 2" variant="outlined"></sky-image>
 * <sky-image src="/spa.jpg" alt="Spa room" href="/spa/urban-wellness" shape="extra-large"></sky-image>
 * <sky-image alt="Photo coming soon"></sky-image>
 */
export class SkyImage extends LitElement {
  static override properties = {
    src: { type: String },
    alt: { type: String },
    href: { type: String },
    label: { type: String },
    ratio: { type: String },
    fit: { type: String, reflect: true },
    placeholderIcon: { type: String, attribute: 'placeholder-icon' },
    color: { type: String, reflect: true },
    variant: { type: String, reflect: true },
    shape: { type: String, reflect: true },
    failed: { state: true },
  };

  declare src?: string;
  /** Image description. Empty string marks the image decorative. */
  declare alt: string;
  /** Makes the whole frame a link. */
  declare href?: string;
  /** Link name when it should differ from `alt` (e.g. "Visit My Spa Deal"). */
  declare label?: string;
  /** Any CSS aspect-ratio value. */
  declare ratio: string;
  /** 'cover' fills and crops; 'contain' fits inside with padding (logos). */
  declare fit: 'cover' | 'contain';
  declare placeholderIcon: string;
  declare color: SkyColor;
  declare variant: SkyVariant;
  declare shape: SkyShape;
  declare failed: boolean;

  constructor() {
    super();
    this.alt = '';
    this.ratio = '1 / 1';
    this.fit = 'cover';
    this.placeholderIcon = 'image';
    this.color = 'surface';
    this.variant = 'filled';
    this.shape = 'medium';
    this.failed = false;
  }

  static override styles = css`
    ${hostBase}
    ${colorRoles}
    ${shapeScale}
    ${cardVariants}
    .surface {
      margin: 0;
      overflow: hidden;
      aspect-ratio: var(--_ratio);
      display: grid;
      place-items: center;
    }
    img {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
      display: block;
    }
    :host([fit='contain']) img {
      object-fit: contain;
      padding: 12px;
    }
    .placeholder {
      --md-icon-size: 40px;
      color: var(--_on-variant);
    }
  `;

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('src')) this.failed = false;
  }

  protected override render() {
    const showImage = !!this.src && !this.failed;
    const linkName = this.label || this.alt || undefined;
    return html`
      <figure class="surface" style="--_ratio: ${this.ratio}">
        ${showImage
          ? html`<img
              src=${this.src}
              alt=${this.href && linkName ? '' : this.alt}
              loading="lazy"
              decoding="async"
              @error=${() => (this.failed = true)}
            />`
          : html`<span role=${this.alt ? 'img' : nothing} aria-label=${this.alt || nothing}>
              <md-icon class="placeholder" aria-hidden="true">${this.placeholderIcon}</md-icon>
            </span>`}
        ${this.href
          ? html`<a class="stretch" href=${this.href} aria-label=${linkName ?? nothing}>
              <md-ripple></md-ripple>
              <md-focus-ring></md-focus-ring>
            </a>`
          : nothing}
      </figure>
    `;
  }
}

if (!customElements.get('sky-image')) {
  customElements.define('sky-image', SkyImage);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-image': SkyImage;
  }
}
