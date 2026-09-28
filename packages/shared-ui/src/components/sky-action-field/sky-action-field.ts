import { LitElement, html, css, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import '@material/web/icon/icon.js';
import '@material/web/button/filled-button.js';
import '@material/web/iconbutton/filled-icon-button.js';
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
    .action {
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
          @input=${this.onInput}
        />
        ${this.renderAction()}
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
