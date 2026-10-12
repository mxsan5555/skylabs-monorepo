import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/button/text-button.js';

export type SkySnackbarVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';
export type SkySnackbarCloseReason = 'timeout' | 'action' | 'close' | 'manual';

const DEFAULT_ICON: Record<SkySnackbarVariant, string> = {
  neutral: '',
  success: 'check_circle',
  warning: 'warning',
  error: 'error',
  info: 'info',
};

/**
 * <sky-snackbar> — M3 snackbar (https://m3.material.io/components/snackbar/overview):
 * a brief, non-modal message at the bottom of the screen with an optional text
 * action and an optional close icon. Message content is the default slot.
 *
 * M3's spec ships one neutral colour (inverse-surface); this adds four semantic
 * variants on top, mapped onto the same M3 role pairs the rest of this design
 * system already uses for status (see `sky-data-table`'s statusMap): success→
 * tertiary, warning→secondary, error→error, info→primary. `neutral` is the M3
 * default (inverse-surface / inverse-on-surface / inverse-primary action).
 *
 * Non-modal: never steals focus. Auto-dismiss pauses on hover/focus (WCAG 2.2
 * SC 2.2.1 Timing Adjustable) and resumes on mouseleave/blur. `role`/`aria-live`
 * follow variant: `error` is `alert`/`assertive` (needs immediate announcement),
 * everything else is `status`/`polite`.
 *
 * Only one instance should be visible at a time per M3 guidance — place one
 * `<sky-snackbar>` per page/layout and drive it with `show()`/`hide()`, same
 * pattern as this library's `<md-dialog>` usage (a `dialogRef.show()` call).
 *
 * @prop {SkySnackbarVariant} variant     — 'neutral' | 'success' | 'warning' | 'error' | 'info' (default 'neutral').
 * @prop {string}  actionLabel            — Optional text action button (attribute: action-label).
 * @prop {boolean} closable               — Shows a close icon button.
 * @prop {number}  duration               — Auto-dismiss delay in ms (default 4000). 0 disables auto-dismiss.
 * @prop {string}  icon                   — Leading icon override. Defaults per variant; set to "" to force no icon.
 * @prop {boolean} open                   — Current visibility (reflected attribute).
 *
 * @fires sky-action — Action button clicked (fires before the snackbar closes).
 * @fires sky-closed — CustomEvent<{ reason: 'timeout'|'action'|'close'|'manual' }> whenever it closes.
 *
 * @example
 * <sky-snackbar id="toast" variant="success" action-label="Undo" closable duration="4000">
 *   Changes saved.
 * </sky-snackbar>
 * <script>
 *   toast.addEventListener('sky-action', () => undoLastChange());
 *   toast.show();
 * </script>
 */
export class SkySnackbar extends LitElement {
  static override properties = {
    variant: { type: String, reflect: true },
    actionLabel: { type: String, attribute: 'action-label' },
    closable: { type: Boolean, reflect: true },
    duration: { type: Number },
    icon: { type: String },
    open: { type: Boolean, reflect: true },
  };

  declare variant: SkySnackbarVariant;
  declare actionLabel?: string;
  declare closable: boolean;
  declare duration: number;
  declare icon?: string;
  declare open: boolean;

  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _remainingMs = 0;
  private _timerStartedAt = 0;

  constructor() {
    super();
    this.variant = 'neutral';
    this.closable = false;
    this.duration = 4000;
    this.open = false;
  }

  static override styles = css`
    :host {
      position: fixed;
      inset-block-end: 24px;
      inset-inline-start: 50%;
      transform: translateX(-50%);
      z-index: 2000;
      box-sizing: border-box;
      min-inline-size: 344px;
      max-inline-size: 672px;
      width: fit-content;
      font-family: var(--md-sys-typescale-body-medium-font);
      pointer-events: none;
      visibility: hidden;
      opacity: 0;
      transition:
        opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
        transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized-decelerate),
        visibility 0s linear var(--md-sys-motion-duration-short4);
      --_bg: var(--md-sys-color-inverse-surface);
      --_fg: var(--md-sys-color-inverse-on-surface);
      --_action: var(--md-sys-color-inverse-primary);
    }
    :host([open]) {
      pointer-events: auto;
      visibility: visible;
      opacity: 1;
      transform: translateX(-50%) translateY(0);
      transition-delay: 0s;
    }
    :host(:not([open])) {
      transform: translateX(-50%) translateY(8px);
    }
    :host([variant='success']) {
      --_bg: var(--md-sys-color-tertiary);
      --_fg: var(--md-sys-color-on-tertiary);
      --_action: var(--md-sys-color-on-tertiary);
    }
    :host([variant='warning']) {
      --_bg: var(--md-sys-color-secondary);
      --_fg: var(--md-sys-color-on-secondary);
      --_action: var(--md-sys-color-on-secondary);
    }
    :host([variant='error']) {
      --_bg: var(--md-sys-color-error);
      --_fg: var(--md-sys-color-on-error);
      --_action: var(--md-sys-color-on-error);
    }
    :host([variant='info']) {
      --_bg: var(--md-sys-color-primary);
      --_fg: var(--md-sys-color-on-primary);
      --_action: var(--md-sys-color-on-primary);
    }
    @media (max-width: 599.98px) {
      :host {
        inset-inline: 16px;
        inset-inline-start: 16px;
        min-inline-size: 0;
        max-inline-size: none;
        width: auto;
        transform: none;
      }
      :host([open]) {
        transform: none;
      }
      :host(:not([open])) {
        transform: translateY(8px);
      }
    }
    .surface {
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      min-block-size: 48px;
      padding-block: 8px;
      padding-inline-start: 16px;
      padding-inline-end: 8px;
      border-radius: var(--md-sys-shape-corner-extra-small);
      background-color: var(--_bg);
      color: var(--_fg);
      box-shadow: var(--sky-elevation-3);
    }
    .icon {
      flex-shrink: 0;
      color: var(--_fg);
    }
    .message {
      flex: 1;
      min-inline-size: 0;
      font-size: var(--md-sys-typescale-body-medium-size);
      line-height: var(--md-sys-typescale-body-medium-line-height);
      letter-spacing: var(--md-sys-typescale-body-medium-tracking);
      overflow-wrap: break-word;
    }
    .action {
      flex-shrink: 0;
      --md-text-button-label-text-color: var(--_action);
      --md-text-button-hover-label-text-color: var(--_action);
      --md-text-button-focus-label-text-color: var(--_action);
      --md-text-button-pressed-label-text-color: var(--_action);
      --md-text-button-hover-state-layer-color: var(--_action);
      --md-text-button-pressed-state-layer-color: var(--_action);
      --md-text-button-label-text-weight: 600;
    }
    .close {
      flex-shrink: 0;
      --md-icon-button-icon-color: var(--_fg);
      --md-icon-button-hover-icon-color: var(--_fg);
      --md-icon-button-focus-icon-color: var(--_fg);
      --md-icon-button-pressed-icon-color: var(--_fg);
      --md-icon-button-hover-state-layer-color: var(--_fg);
      --md-icon-button-pressed-state-layer-color: var(--_fg);
    }
  `;

  private get _resolvedIcon(): string {
    return this.icon !== undefined ? this.icon : DEFAULT_ICON[this.variant];
  }

  private _clearTimer(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _startTimer(ms: number): void {
    this._clearTimer();
    if (ms <= 0) {
      this._remainingMs = 0;
      return;
    }
    this._remainingMs = ms;
    this._timerStartedAt = Date.now();
    this._timer = setTimeout(() => this.hide('timeout'), ms);
  }

  private readonly _pauseTimer = (): void => {
    if (!this._timer) return;
    clearTimeout(this._timer);
    this._timer = null;
    this._remainingMs -= Date.now() - this._timerStartedAt;
  };

  private readonly _resumeTimer = (): void => {
    if (this._timer || this._remainingMs <= 0 || !this.open) return;
    this._timerStartedAt = Date.now();
    this._timer = setTimeout(() => this.hide('timeout'), this._remainingMs);
  };

  /** Opens the snackbar. Pass a string to replace the slotted message first. Restarts the timer. */
  show(message?: string): void {
    if (typeof message === 'string') this.textContent = message;
    this.open = true;
    this._startTimer(this.duration);
  }

  /** Closes the snackbar and fires `sky-closed` with the given reason. */
  hide(reason: SkySnackbarCloseReason = 'manual'): void {
    if (!this.open) return;
    this._clearTimer();
    this.open = false;
    this.dispatchEvent(new CustomEvent('sky-closed', { detail: { reason }, bubbles: true, composed: true }));
  }

  private readonly _onAction = (): void => {
    this.dispatchEvent(new CustomEvent('sky-action', { bubbles: true, composed: true }));
    this.hide('action');
  };

  private readonly _onClose = (): void => {
    this.hide('close');
  };

  protected override updated(changed: PropertyValues): void {
    if (changed.has('variant') || !this.hasAttribute('role')) {
      const urgent = this.variant === 'error';
      this.setAttribute('role', urgent ? 'alert' : 'status');
      this.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
      this.setAttribute('aria-atomic', 'true');
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearTimer();
  }

  protected override render() {
    const icon = this._resolvedIcon;
    return html`
      <div
        class="surface"
        @mouseenter=${this._pauseTimer}
        @mouseleave=${this._resumeTimer}
        @focusin=${this._pauseTimer}
        @focusout=${this._resumeTimer}
      >
        ${icon ? html`<md-icon class="icon" aria-hidden="true">${icon}</md-icon>` : nothing}
        <div class="message"><slot></slot></div>
        ${this.actionLabel
          ? html`<md-text-button class="action" @click=${this._onAction}>${this.actionLabel}</md-text-button>`
          : nothing}
        ${this.closable
          ? html`
              <md-icon-button class="close" aria-label="Dismiss notification" @click=${this._onClose}>
                <md-icon aria-hidden="true">close</md-icon>
              </md-icon-button>
            `
          : nothing}
      </div>
    `;
  }
}

if (!customElements.get('sky-snackbar')) {
  customElements.define('sky-snackbar', SkySnackbar);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-snackbar': SkySnackbar;
  }
}
