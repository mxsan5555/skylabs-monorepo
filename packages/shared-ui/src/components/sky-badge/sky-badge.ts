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
    :host {
      --_bg: var(--md-sys-color-primary);
      --_fg: var(--md-sys-color-on-primary);
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
    // When a label is supplied the span surfaces it to AT; slotted text is
    // still visible but the label gives the full context (e.g. "12 unread").
    return this.label
      ? html`<span aria-label=${this.label}><slot></slot></span>`
      : html`<span><slot></slot></span>`;
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
