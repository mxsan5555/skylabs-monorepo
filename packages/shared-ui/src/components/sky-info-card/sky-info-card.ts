import { LitElement, html, css, nothing } from 'lit';
// Register md-icon for the optional icon fallback.
import '@material/web/icon/icon.js';
import { alignment, hostBase, typescale } from '../shared-styles.js';

/**
 * <sky-info-card> — surface card with an illustration/icon, heading and subheading.
 *
 * Semantic `<article>` with an `<h3>` heading and `<p>` subheading. Provide an
 * illustration via the `media` slot, or set `icon` for a Material Symbol fallback.
 * Presentational LIT element (decorator-free), themed by `--md-sys-color-*`, fluid.
 *
 * @example
 * <sky-info-card icon="support_agent"
 *   heading="Trusted 24/7 customer service you can rely on"
 *   subheading="We're always here to help" align="left"></sky-info-card>
 */
export class SkyInfoCard extends LitElement {
  static override properties = {
    icon: { type: String },
    heading: { type: String },
    subheading: { type: String },
    align: { type: String, reflect: true },
  };

  declare icon?: string;
  declare heading?: string;
  declare subheading?: string;
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
    .card {
      display: flex;
      flex-direction: column;
      align-items: var(--_align);
      gap: 10px;
      block-size: 100%;
      padding: 20px;
      border-radius: var(--md-sys-shape-corner-large);
      background-color: var(--md-sys-color-surface-container);
    }
    .media md-icon {
      --md-icon-size: 44px;
      color: var(--md-sys-color-primary);
    }
    ::slotted([slot='media']) {
      max-block-size: 72px;
      inline-size: auto;
    }
    .subheading {
      color: var(--md-sys-color-on-surface-variant);
    }
  `;

  protected override render() {
    return html`
      <article class="card">
        <span class="media">
          <slot name="media">
            ${this.icon
              ? html`<md-icon aria-hidden="true">${this.icon}</md-icon>`
              : nothing}
          </slot>
        </span>
        ${this.heading
          ? html`<h3 class="heading title-medium">${this.heading}</h3>`
          : nothing}
        ${this.subheading
          ? html`<p class="subheading body-medium">${this.subheading}</p>`
          : nothing}
        <slot></slot>
      </article>
    `;
  }
}

if (!customElements.get('sky-info-card')) {
  customElements.define('sky-info-card', SkyInfoCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-info-card': SkyInfoCard;
  }
}
