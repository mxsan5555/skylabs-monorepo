import { LitElement, html, css } from 'lit';
// Side-effect: make sure the item is registered when the group is imported.
import './sky-accordion-item.js';

/**
 * <sky-accordion> — groups `<sky-accordion-item>`s with spacing and an optional
 * single-open mode.
 *
 * Presentational LIT element (decorator-free). With `single`, opening one item
 * closes the others (classic accordion behaviour); without it, items toggle
 * independently. Items stay light-DOM children, so each app composes its own
 * content.
 *
 * @example
 * <sky-accordion single>
 *   <sky-accordion-item header="One" open>…</sky-accordion-item>
 *   <sky-accordion-item header="Two">…</sky-accordion-item>
 * </sky-accordion>
 */
export class SkyAccordion extends LitElement {
  static override properties = {
    single: { type: Boolean, reflect: true },
  };

  /** When set, only one item may be open at a time. */
  declare single: boolean;

  constructor() {
    super();
    this.single = false;
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
    }
  `;

  /** Close the other items when one opens (single-open mode). */
  private readonly _onToggle = (e: Event) => {
    if (!this.single) return;
    const detail = (e as CustomEvent<{ open: boolean }>).detail;
    if (!detail?.open) return;
    const opened = e.target as Element;
    this.querySelectorAll('sky-accordion-item').forEach((item) => {
      if (item !== opened) item.open = false;
    });
  };

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('toggle', this._onToggle);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('toggle', this._onToggle);
  }

  protected override render() {
    return html`<slot></slot>`;
  }
}

if (!customElements.get('sky-accordion')) {
  customElements.define('sky-accordion', SkyAccordion);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-accordion': SkyAccordion;
  }
}
