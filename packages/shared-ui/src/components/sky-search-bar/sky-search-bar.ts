import { LitElement, html, css } from 'lit';
import { hostBase, focusRing } from '../shared-styles.js';

/**
 * <sky-search-bar> — accessible pill-shaped search field.
 *
 * Decorated-free LIT (decorator-free static properties/styles) so it compiles
 * identically in Vite (msd) and Angular (mera-driver). Fully themed with
 * --md-sys-color-* tokens. Emits a composed, bubbling `sky-search` event when
 * submitted.
 *
 * @fires sky-search — CustomEvent<{ query: string }> on form submit
 *
 * @example
 * <sky-search-bar
 *   placeholder="Search spas, treatments…"
 *   label="Search massage services"
 * ></sky-search-bar>
 *
 * // React (listen via ref):
 * ref.current.addEventListener('sky-search', (e) => navigate(`/search?q=${e.detail.query}`));
 *
 * // Angular:
 * (sky-search)="onSearch($event)"
 */
export class SkySearchBar extends LitElement {
  static override properties = {
    placeholder: { type: String },
    value: { type: String },
    label: { type: String },
    buttonLabel: { type: String, attribute: 'button-label' },
  };

  declare placeholder: string;
  declare value: string;
  /** Accessible label for both the form landmark and the input. */
  declare label: string;
  declare buttonLabel: string;

  constructor() {
    super();
    this.placeholder = 'Search…';
    this.value = '';
    this.label = 'Search';
    this.buttonLabel = 'Search';
  }

  static override styles = css`
    ${hostBase}

    :host {
      display: flex;
      width: 100%;
    }

    form {
      display: flex;
      align-items: center;
      width: 100%;
      height: 48px;
      padding: 0 6px 0 16px;
      gap: 10px;
      border-radius: 50px;
      background: var(--md-sys-color-surface-container-high);
      transition: box-shadow 0.18s ease;
    }

    form:focus-within {
      box-shadow: 0 0 0 2px var(--md-sys-color-primary);
    }

    /* Search icon */
    .icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      color: var(--md-sys-color-on-surface-variant);
      line-height: 0;
    }

    /* Native text input */
    input {
      flex: 1;
      min-width: 0;
      padding: 0;
      border: none;
      background: transparent;
      font-size: 0.875rem;
      font-family: var(--md-sys-typescale-body-medium-font, 'Roboto', sans-serif);
      color: var(--md-sys-color-on-surface);
      outline: none;
    }

    input::placeholder {
      color: var(--md-sys-color-on-surface-variant);
      opacity: 1;
    }

    /* Hide browser's native clear button */
    input::-webkit-search-cancel-button { display: none; }

    /* Submit pill */
    button {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 20px;
      height: 36px;
      border: none;
      border-radius: 50px;
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-size: 0.875rem;
      font-weight: 500;
      font-family: var(--md-sys-typescale-label-large-font, 'Roboto', sans-serif);
      letter-spacing: 0.00625em;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;
    }

    button:hover {
      background: color-mix(in srgb, var(--md-sys-color-primary) 85%, black);
    }

    button:focus-visible {
      ${focusRing}
    }

    /* Compact at narrow widths */
    @media (max-width: 480px) {
      form {
        height: 44px;
        padding: 0 4px 0 12px;
        gap: 8px;
      }

      button {
        padding: 0 14px;
        height: 32px;
        font-size: 0.8125rem;
      }
    }
  `;

  private readonly _handleInput = (e: Event) => {
    this.value = (e.target as HTMLInputElement).value;
  };

  private readonly _handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const q = this.value.trim();
    if (!q) return;
    this.dispatchEvent(
      new CustomEvent('sky-search', {
        detail: { query: q },
        bubbles: true,
        composed: true,
      })
    );
  };

  protected override render() {
    return html`
      <form
        role="search"
        aria-label=${this.label}
        @submit=${this._handleSubmit}
      >
        <span class="icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
            <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </span>

        <input
          type="search"
          autocomplete="off"
          spellcheck="false"
          enterkeyhint="search"
          placeholder=${this.placeholder}
          aria-label=${this.label}
          .value=${this.value}
          @input=${this._handleInput}
        />

        <button type="submit" aria-label="Submit search">
          ${this.buttonLabel}
        </button>
      </form>
    `;
  }
}

if (!customElements.get('sky-search-bar')) {
  customElements.define('sky-search-bar', SkySearchBar);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-search-bar': SkySearchBar;
  }
}
