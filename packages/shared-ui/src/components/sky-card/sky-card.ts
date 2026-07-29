import { LitElement, html, css } from 'lit';
import { hostBase } from '../shared-styles.js';

/**
 * <sky-card> — themed Material 3 surface container, built with LIT.
 *
 * A presentational, framework-agnostic card used to group content (blog cards,
 * profile panels, dashboard tiles). Themed by the same --md-sys-color-* tokens
 * as Material Web, so it inherits each app's brand palette. Decorator-free for
 * cross-framework source compatibility.
 *
 * @example
 * <sky-card>Plain content</sky-card>
 * <sky-card variant="outlined">…</sky-card>
 * <sky-card variant="elevated">…</sky-card>
 */
export class SkyCard extends LitElement {
  static override properties = {
    variant: { type: String, reflect: true },
  };

  /** Surface style: 'filled' | 'outlined' | 'elevated'. */
  declare variant: 'filled' | 'outlined' | 'elevated';

  constructor() {
    super();
    this.variant = 'filled';
  }

  static override styles = css`
    ${hostBase}
    :host {
      padding: 16px 20px;
      border-radius: var(--md-sys-shape-corner-large, 16px);
      background-color: var(--md-sys-color-surface-container);
    }
    :host([variant='outlined']) {
      background-color: var(--md-sys-color-surface);
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    :host([variant='elevated']) {
      background-color: var(--md-sys-color-surface-container-low);
      box-shadow:
        0 1px 2px color-mix(in srgb, var(--md-sys-color-shadow) 30%, transparent),
        0 1px 3px 1px color-mix(in srgb, var(--md-sys-color-shadow) 15%, transparent);
    }
  `;

  protected override render() {
    return html`<slot></slot>`;
  }
}

if (!customElements.get('sky-card')) {
  customElements.define('sky-card', SkyCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-card': SkyCard;
  }
}
