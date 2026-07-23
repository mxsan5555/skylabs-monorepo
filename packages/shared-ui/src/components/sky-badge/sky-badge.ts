import { LitElement, html, css } from 'lit';

/**
 * <sky-badge> — example custom Material 3 web component built with LIT.
 *
 * Written without decorators (static `properties` + static `styles`) so the
 * source compiles identically under Vite/esbuild (msd) and Angular's build
 * (mera-driver) with no experimental-decorator coupling. It is themed by the
 * same `--md-sys-color-*` tokens as Material Web, so it inherits each app's
 * brand palette automatically.
 *
 * Use it as the pattern for the team's own M3 components.
 *
 * @example
 * <sky-badge>New</sky-badge>
 * <sky-badge variant="tertiary" size="large">12</sky-badge>
 */
export class SkyBadge extends LitElement {
  static override properties = {
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
  };

  /** Color role: 'primary' | 'secondary' | 'tertiary' | 'error'. */
  declare variant: 'primary' | 'secondary' | 'tertiary' | 'error';
  /** Visual size: 'small' | 'medium' | 'large'. */
  declare size: 'small' | 'medium' | 'large';

  constructor() {
    super();
    this.variant = 'primary';
    this.size = 'medium';
  }

  static override styles = css`
    :host {
      --_bg: var(--md-sys-color-primary, #3a693c);
      --_fg: var(--md-sys-color-on-primary, #fff);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-width: 1.5rem;
      padding: 0 0.5rem;
      height: 1.5rem;
      border-radius: 999px;
      background-color: var(--_bg);
      color: var(--_fg);
      font-family: var(--md-sys-typescale-label-large-font, 'Roboto', sans-serif);
      font-size: 0.6875rem;
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0.03em;
      user-select: none;
    }
    :host([variant='secondary']) {
      --_bg: var(--md-sys-color-secondary, #52634f);
      --_fg: var(--md-sys-color-on-secondary, #fff);
    }
    :host([variant='tertiary']) {
      --_bg: var(--md-sys-color-tertiary, #38656a);
      --_fg: var(--md-sys-color-on-tertiary, #fff);
    }
    :host([variant='error']) {
      --_bg: var(--md-sys-color-error, #ba1a1a);
      --_fg: var(--md-sys-color-on-error, #fff);
    }
    :host([size='small']) {
      height: 1.125rem;
      min-width: 1.125rem;
      font-size: 0.625rem;
      padding: 0 0.375rem;
    }
    :host([size='large']) {
      height: 2rem;
      min-width: 2rem;
      font-size: 0.8125rem;
      padding: 0 0.75rem;
    }
  `;

  protected override render() {
    return html`<slot></slot>`;
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
