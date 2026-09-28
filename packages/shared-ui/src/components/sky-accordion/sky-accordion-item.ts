import { LitElement, html, css, nothing } from 'lit';
// Register the M3 icon used for the chevron indicator.
import '@material/web/icon/icon.js';
import { focusRing, hostBase, nextId, typescale } from '../shared-styles.js';

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

  private readonly _panelId = nextId('sky-acc-panel');
  private readonly _triggerId = nextId('sky-acc-trigger');

  constructor() {
    super();
    this.open = false;
    this.disabled = false;
    this.variant = 'outlined';
    this.level = 3;
  }

  static override styles = css`
    ${hostBase}
    ${typescale}
    .item {
      border-radius: var(--md-sys-shape-corner-medium);
      overflow: hidden;
      background-color: var(--md-sys-color-surface);
    }
    :host([variant='outlined']) .item {
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    :host([variant='filled']) .item {
      background-color: var(--md-sys-color-surface-container);
    }
    :host([variant='elevated']) .item {
      background-color: var(--md-sys-color-surface-container-low);
      box-shadow: var(--sky-elevation-1);
    }
    .heading {
      margin: 0;
    }
    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      inline-size: 100%;
      margin: 0;
      padding: 16px 20px;
      border: none;
      background: transparent;
      color: inherit;
      text-align: start;
      cursor: pointer;
    }
    .trigger:hover {
      background-color: color-mix(
        in srgb,
        var(--md-sys-color-on-surface) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
        transparent
      );
    }
    .trigger:focus-visible {
      ${focusRing}
      outline-offset: -3px;
    }
    .trigger:disabled {
      cursor: default;
      background-color: transparent;
      opacity: var(--md-sys-state-disabled-opacity);
    }
    .title {
      flex: 1;
      min-inline-size: 0;
    }
    .chevron {
      flex: none;
      color: var(--md-sys-color-on-surface-variant);
      transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    }
    .trigger[aria-expanded='true'] .chevron {
      transform: rotate(180deg);
    }
    .panel {
      border-block-start: 1px solid var(--md-sys-color-outline-variant);
    }
    .content {
      padding: 16px 20px;
      color: var(--md-sys-color-on-surface-variant);
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
            class="trigger title-medium"
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
          <div class="content body-medium"><slot></slot></div>
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
