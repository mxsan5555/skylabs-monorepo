import { LitElement, html, css, nothing } from 'lit';
// Register the M3 icon used for the chevron indicator.
import '@material/web/icon/icon.js';
import { hostBase } from '../shared-styles.js';

let uid = 0;

/**
 * <sky-accordion-item> — a single expandable panel, styled as an M3 card.
 *
 * Built with LIT (decorator-free). The header is one accessible trigger button
 * (`aria-expanded` + `aria-controls`) carrying a rotating `md-icon` chevron; the
 * body is a labelled region that is fully removed (`hidden`) when collapsed. A
 * nested `md-icon-button` is intentionally avoided — a button inside the header
 * button would be invalid/inaccessible — so the chevron is a rotating `md-icon`
 * inside the single trigger.
 *
 * Themed by `--md-sys-color-*`. Primitive props → identical usage in React and
 * Angular. Group several inside `<sky-accordion>` (optional single-open mode).
 *
 * @example
 * <sky-accordion-item header="Accordion 1" open>Lorem ipsum…</sky-accordion-item>
 */
export class SkyAccordionItem extends LitElement {
  static override properties = {
    header: { type: String },
    open: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    variant: { type: String, reflect: true },
    level: { type: Number },
  };

  declare header?: string;
  declare open: boolean;
  declare disabled: boolean;
  /** Card surface style: 'outlined' (default) | 'filled' | 'elevated'. */
  declare variant: 'outlined' | 'filled' | 'elevated';
  /** Heading level for the trigger (1–6), for a correct document outline. */
  declare level: number;

  private readonly _uid = ++uid;
  private get _panelId() {
    return `sky-acc-panel-${this._uid}`;
  }
  private get _triggerId() {
    return `sky-acc-trigger-${this._uid}`;
  }

  constructor() {
    super();
    this.open = false;
    this.disabled = false;
    this.variant = 'outlined';
    this.level = 3;
  }

  static override styles = css`
    ${hostBase}
    .item {
      border-radius: var(--sky-accordion-border-radius, 12px);
      overflow: hidden;
      background-color: var(--md-sys-color-surface, #fafdfb);
    }
    :host([variant='outlined']) .item {
      border: 1px solid var(--md-sys-color-outline-variant, #c2c7ce);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }
    :host([variant='filled']) .item {
      background-color: var(--md-sys-color-surface-container, #eef1f6);
    }
    :host([variant='elevated']) .item {
      background-color: var(--md-sys-color-surface-container-low, #f3f4f9);
      box-shadow:
        0 1px 2px rgba(0, 0, 0, 0.3),
        0 1px 3px 1px rgba(0, 0, 0, 0.15);
    }
    .heading {
      margin: 0;
    }
    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 16px 20px;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 1rem;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
    }
    .trigger:hover {
      background-color: color-mix(
        in srgb,
        var(--md-sys-color-on-surface) 6%,
        transparent
      );
    }
    .trigger:focus-visible {
      outline: 2px solid var(--md-sys-color-primary, #3a693c);
      outline-offset: -2px;
    }
    .trigger:disabled {
      cursor: default;
      color: color-mix(
        in srgb,
        var(--md-sys-color-on-surface) 38%,
        transparent
      );
    }
    .title {
      flex: 1;
      min-width: 0;
    }
    .chevron {
      flex: none;
      color: var(--md-sys-color-on-surface-variant, #424940);
      transition: transform 200ms ease;
    }
    .trigger[aria-expanded='true'] .chevron {
      transform: rotate(180deg);
    }
    .panel {
      border-top: 1px solid var(--md-sys-color-outline-variant, #c2c7ce);
    }
    .content {
      padding: 16px 20px;
      color: var(--md-sys-color-on-surface-variant, #424940);
    }
    [hidden] {
      display: none;
    }
  `;

  private _toggle() {
    if (this.disabled) return;
    this.open = !this.open;
    this.dispatchEvent(
      new CustomEvent('toggle', {
        detail: { open: this.open },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected override render() {
    return html`
      <div class="item">
        <div class="heading" role="heading" aria-level=${this.level}>
          <button
            id=${this._triggerId}
            class="trigger"
            type="button"
            aria-expanded=${this.open ? 'true' : 'false'}
            aria-controls=${this._panelId}
            ?disabled=${this.disabled}
            @click=${this._toggle}
          >
            <span class="title"
              ><slot name="header">${this.header ?? nothing}</slot
            ></span>
            <md-icon class="chevron" aria-hidden="true">expand_more</md-icon>
          </button>
        </div>
        <div
          id=${this._panelId}
          class="panel"
          role="region"
          aria-labelledby=${this._triggerId}
          ?hidden=${!this.open}
        >
          <div class="content"><slot></slot></div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('sky-accordion-item')) {
  customElements.define('sky-accordion-item', SkyAccordionItem);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-accordion-item': SkyAccordionItem;
  }
}
