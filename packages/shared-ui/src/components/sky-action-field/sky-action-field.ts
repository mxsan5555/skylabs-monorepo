import { LitElement, html, css, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import '@material/web/icon/icon.js';
import '@material/web/button/filled-button.js';
import '@material/web/iconbutton/filled-icon-button.js';
import '@material/web/iconbutton/icon-button.js';
import { hostBase } from '../shared-styles.js';
import { shapeScale, type SkyShape } from '../m3-surface.js';

/**
 * <sky-action-field> — single-line text field with an attached action button, for any
 * "type something, then act" pattern: search, newsletter sign-up, coupon code, pincode check.
 *
 * Built on M3: the container follows the M3 search-bar / text-field anatomy (56dp, or 48dp with
 * `dense` = density -2), body-large input text, on-surface-variant leading icon, an on-surface
 * hover state layer and a 2dp primary focus indicator. The action is a real `md-filled-button`
 * (or `md-filled-icon-button` when only `action-icon` is set). All colours are M3 tokens.
 *
 * Submitting (Enter or the button) fires `sky-submit` with the current value; native `input`
 * events bubble out of the host, and `value` stays in sync. `required` uses native validation.
 * Give the host `role="search"` when it is a site search, so it is exposed as a search landmark.
 *
 * Options:
 *   variant  filled | outlined          shape  M3 corner scale (default full)
 *   dense    48dp container              icon   leading Material Symbol
 *   action-label / action-icon          type / name / autocomplete / enterkeyhint
 *   clearable  a Clear icon button while there is a value (`clear-label` names it); clearing
 *              empties the value, fires a composed `input` event and refocuses the input
 *   combobox   the input becomes an ARIA combobox (`aria-autocomplete="list"`, `expanded`);
 *              `controlsElement` / `activeOption` point it at a popup in the page and its active
 *              option. IDs cannot cross the shadow boundary, so these go through ARIA element
 *              reflection (`ariaControlsElements`, `ariaActiveDescendantElement`).
 *
 * @fires sky-submit — CustomEvent<{ value: string }>
 *
 * @example
 * <sky-action-field role="search" label="Search spas and treatments" icon="search"
 *   placeholder="Search spas, treatments, locations" action-label="Search"></sky-action-field>
 * <sky-action-field label="Email address" type="email" autocomplete="email" icon="mail"
 *   variant="outlined" action-label="Subscribe" required></sky-action-field>
 */
export class SkyActionField extends LitElement {
  static override shadowRootOptions = { ...LitElement.shadowRootOptions, delegatesFocus: true };

  static override properties = {
    label: { type: String },
    placeholder: { type: String },
    value: { type: String },
    name: { type: String },
    type: { type: String },
    autocomplete: { type: String },
    enterkeyhint: { type: String },
    icon: { type: String },
    actionLabel: { type: String, attribute: 'action-label' },
    actionIcon: { type: String, attribute: 'action-icon' },
    variant: { type: String, reflect: true },
    shape: { type: String, reflect: true },
    dense: { type: Boolean, reflect: true },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
    clearable: { type: Boolean },
    clearLabel: { type: String, attribute: 'clear-label' },
    combobox: { type: Boolean },
    expanded: { type: Boolean },
    controlsElement: { attribute: false },
    activeOption: { attribute: false },
  };

  /** Accessible name of the input (also names an icon-only action). */
  declare label: string;
  declare placeholder?: string;
  declare value: string;
  declare name?: string;
  declare type: 'text' | 'search' | 'email' | 'tel' | 'url' | 'number';
  declare autocomplete?: string;
  declare enterkeyhint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
  declare icon?: string;
  declare actionLabel?: string;
  declare actionIcon?: string;
  declare variant: 'filled' | 'outlined';
  declare shape: SkyShape;
  declare dense: boolean;
  declare required: boolean;
  declare disabled: boolean;
  declare clearable: boolean;
  declare clearLabel: string;
  declare combobox: boolean;
  declare expanded: boolean;
  /** The popup the combobox controls (e.g. a listbox in the page). */
  declare controlsElement: Element | null;
  /** The popup's active option, announced while focus stays in the input. */
  declare activeOption: Element | null;

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.type = 'text';
    this.variant = 'filled';
    this.shape = 'full';
    this.dense = false;
    this.required = false;
    this.disabled = false;
    this.clearable = false;
    this.clearLabel = 'Clear';
    this.combobox = false;
    this.expanded = false;
    this.controlsElement = null;
    this.activeOption = null;
  }

  static override styles = css`
    ${hostBase}
    ${shapeScale}
    .field {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      block-size: 56px;
      padding-inline: 16px 8px;
      border-radius: var(--_shape);
      background-color: var(--md-sys-color-surface-container-high);
      outline: 1px solid transparent;
      outline-offset: -1px;
    }
    :host([dense]) .field {
      block-size: 48px;
      padding-inline: 16px 4px;
    }
    :host([variant='outlined']) .field {
      background-color: transparent;
      outline-color: var(--md-sys-color-outline);
    }
    /* M3 state layer (hover) */
    .field::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background-color: var(--md-sys-color-on-surface);
      opacity: 0;
      pointer-events: none;
    }
    .field:hover::before {
      opacity: var(--md-sys-state-hover-state-layer-opacity);
    }
    /* M3 focus indicator: 2dp primary */
    .field:focus-within {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: -2px;
    }
    .lead {
      flex-shrink: 0;
      color: var(--md-sys-color-on-surface-variant);
    }
    input {
      flex: 1;
      min-inline-size: 0;
      block-size: 100%;
      padding: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      caret-color: var(--md-sys-color-primary);
      font-family: var(--md-sys-typescale-body-large-font);
      font-size: var(--md-sys-typescale-body-large-size);
      line-height: var(--md-sys-typescale-body-large-line-height);
      letter-spacing: var(--md-sys-typescale-body-large-tracking);
    }
    input::placeholder {
      color: var(--md-sys-color-on-surface-variant);
      opacity: 1;
    }
    input::-webkit-search-cancel-button {
      display: none;
    }
    .action,
    .clear {
      flex-shrink: 0;
      position: relative;
    }
    :host([disabled]) .field {
      opacity: var(--md-sys-state-disabled-opacity);
      pointer-events: none;
    }
  `;

  private readonly onInput = (e: Event) => {
    this.value = (e.target as HTMLInputElement).value;
  };

  private readonly onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent('sky-submit', { detail: { value: this.value.trim() }, bubbles: true, composed: true }),
    );
  };

  private readonly onClear = () => {
    this.value = '';
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    this.renderRoot.querySelector('input')?.focus();
  };

  protected override updated() {
    if (!this.combobox) return;
    const input = this.renderRoot.querySelector('input') as
      | (HTMLInputElement & { ariaControlsElements?: Element[] | null; ariaActiveDescendantElement?: Element | null })
      | null;
    if (!input || !('ariaActiveDescendantElement' in input)) return;
    input.ariaControlsElements = this.controlsElement ? [this.controlsElement] : null;
    input.ariaActiveDescendantElement = this.activeOption;
  }

  private renderClear() {
    if (!this.clearable || !this.value) return nothing;
    return html`<md-icon-button class="clear" type="button" aria-label=${this.clearLabel} ?disabled=${this.disabled} @click=${this.onClear}>
      <md-icon aria-hidden="true">close</md-icon>
    </md-icon-button>`;
  }

  private renderAction() {
    if (this.actionLabel) {
      return html`<md-filled-button class="action" type="submit" ?disabled=${this.disabled} ?trailing-icon=${!!this.actionIcon}>
        ${this.actionLabel}
        ${this.actionIcon ? html`<md-icon slot="icon" aria-hidden="true">${this.actionIcon}</md-icon>` : nothing}
      </md-filled-button>`;
    }
    if (this.actionIcon) {
      return html`<md-filled-icon-button class="action" type="submit" aria-label=${this.label} ?disabled=${this.disabled}>
        <md-icon>${this.actionIcon}</md-icon>
      </md-filled-icon-button>`;
    }
    return nothing;
  }

  protected override render() {
    return html`
      <form class="field" @submit=${this.onSubmit}>
        ${this.icon ? html`<md-icon class="lead" aria-hidden="true">${this.icon}</md-icon>` : nothing}
        <input
          .value=${live(this.value)}
          type=${this.type}
          name=${this.name ?? nothing}
          placeholder=${this.placeholder ?? nothing}
          aria-label=${this.label || nothing}
          autocomplete=${this.autocomplete ?? nothing}
          enterkeyhint=${this.enterkeyhint ?? nothing}
          ?required=${this.required}
          ?disabled=${this.disabled}
          role=${this.combobox ? 'combobox' : nothing}
          aria-autocomplete=${this.combobox ? 'list' : nothing}
          aria-expanded=${this.combobox ? String(this.expanded) : nothing}
          @input=${this.onInput}
        />
        ${this.renderClear()}${this.renderAction()}
      </form>
    `;
  }
}

if (!customElements.get('sky-action-field')) {
  customElements.define('sky-action-field', SkyActionField);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-action-field': SkyActionField;
  }
}
