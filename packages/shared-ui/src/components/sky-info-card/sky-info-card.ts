import { LitElement, html, css, nothing } from 'lit';
// Register md-icon for the optional icon fallback.
import '@material/web/icon/icon.js';
import { hostBase } from '../shared-styles.js';

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
    .card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 20px;
      border-radius: 16px;
      background-color: var(--md-sys-color-surface-container);
    }
    .media {
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
    }
    .media md-icon {
      --md-icon-size: 44px;
      color: var(--md-sys-color-primary);
    }
    ::slotted([slot='media']) {
      max-height: 72px;
      width: auto;
    }
    .heading {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.3;
    }
    .subheading {
      margin: 0;
      font-size: 0.875rem;
      color: var(--md-sys-color-on-surface-variant);
    }
    :host([align='center']) .card {
      align-items: center;
      text-align: center;
    }
    :host([align='center']) .media {
      justify-content: center;
    }
    :host([align='right']) .card {
      align-items: flex-end;
      text-align: right;
    }
    :host([align='right']) .media {
      justify-content: flex-end;
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
          ? html`<h3 class="heading">${this.heading}</h3>`
          : nothing}
        ${this.subheading
          ? html`<p class="subheading">${this.subheading}</p>`
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
