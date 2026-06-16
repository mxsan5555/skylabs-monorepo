import { LitElement, html, css } from 'lit';

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
    :host {
      display: block;
      box-sizing: border-box;
      padding: 16px 20px;
      border-radius: 16px;
      background-color: var(--md-sys-color-surface-container, #eef1f6);
      color: var(--md-sys-color-on-surface, #191c1f);
    }
    :host([variant='outlined']) {
      background-color: var(--md-sys-color-surface, #fafdfb);
      border: 1px solid var(--md-sys-color-outline-variant, #c2c7ce);
    }
    :host([variant='elevated']) {
      background-color: var(--md-sys-color-surface-container-low, #f3f4f9);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.3),
        0 1px 3px 1px rgba(0, 0, 0, 0.15);
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
