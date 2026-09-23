import { LitElement, html, css } from 'lit';
import { srOnly } from '../shared-styles.js';

/**
 * <sky-badge> — example custom Material 3 web component built with LIT.
 *
 * Written without decorators (static `properties` + static `styles`) so the
 * source compiles identically under Vite/esbuild (msd) and Angular's build
 * (mera-driver) with no experimental-decorator coupling. It is themed by the
 * same `--md-sys-color-*` tokens as Material Web, so it inherits each app's
 * brand palette automatically.
 *
 * @example
 * <sky-badge>New</sky-badge>
 * <sky-badge variant="tertiary" size="large">12</sky-badge>
 */
export class SkyBadge extends LitElement {
  static override properties = {
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
    label: { type: String },
  };

  /** Color role: 'primary' | 'secondary' | 'tertiary' | 'error'. */
  declare variant: 'primary' | 'secondary' | 'tertiary' | 'error';
  /** Visual size: 'small' | 'medium' | 'large'. */
  declare size: 'small' | 'medium' | 'large';
  /**
   * Accessible label for icon-only or numeric badges whose meaning is
   * colour-only (e.g. label="12 unread notifications"). When slotted text
   * is present and self-explanatory, this prop can be omitted.
   */
  declare label?: string;

  constructor() {
    super();
    this.variant = 'primary';
    this.size = 'medium';
  }

  static override styles = css`
    ${srOnly}
    :host {
      --_bg: var(--md-sys-color-primary);
      --_fg: var(--md-sys-color-on-primary);
      --_size: 1.5rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-inline-size: var(--_size);
      block-size: var(--_size);
      padding-inline: 0.5rem;
      border-radius: var(--md-sys-shape-corner-full);
      background-color: var(--_bg);
      color: var(--_fg);
      font-family: var(--md-sys-typescale-label-small-font);
      font-size: var(--md-sys-typescale-label-small-size);
      font-weight: 600;
      line-height: 1;
      letter-spacing: var(--md-sys-typescale-label-small-tracking);
      user-select: none;
    }
    :host([variant='secondary']) {
      --_bg: var(--md-sys-color-secondary);
      --_fg: var(--md-sys-color-on-secondary);
    }
    :host([variant='tertiary']) {
      --_bg: var(--md-sys-color-tertiary);
      --_fg: var(--md-sys-color-on-tertiary);
    }
    :host([variant='error']) {
      --_bg: var(--md-sys-color-error);
      --_fg: var(--md-sys-color-on-error);
    }
    :host([size='small']) {
      --_size: 1.125rem;
      padding-inline: 0.375rem;
    }
    :host([size='large']) {
      --_size: 2rem;
      padding-inline: 0.75rem;
      font-size: var(--md-sys-typescale-label-large-size);
    }
  `;

  protected override render() {
    // aria-label is ignored on a generic <span>, so a supplied label is announced
    // as hidden text and the visible (often numeric) content is hidden from AT.
    return this.label
      ? html`<span class="sr-only">${this.label}</span><span aria-hidden="true"><slot></slot></span>`
      : html`<slot></slot>`;
  }
}

if (!customElements.get('sky-badge')) {
  customElements.define('sky-badge', SkyBadge);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-badge': SkyBadge;
  }
}
