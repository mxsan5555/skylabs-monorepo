import { LitElement, html, css, nothing } from 'lit';
import '@material/web/icon/icon.js';
import '@material/web/button/filled-button.js';
import { hostBase } from '../shared-styles.js';
import {
  cardVariants,
  colorRoles,
  ctaButton,
  iconContainer,
  shapeScale,
  typeRoles,
  type SkyColor,
  type SkyIconStyle,
  type SkyShape,
  type SkyVariant,
} from '../m3-surface.js';

/**
 * <sky-feature-card> — promotional M3 card: icon container, headline, supporting text and a
 * call to action. The CTA is an md-filled-button tinted to the card's accent role, so it stays
 * on-brand and at AA contrast on every `color`. Use the `actions` slot for custom buttons.
 *
 * Options (all attributes, all mapped to M3 tokens):
 *   color       none | surface | surface-high | primary | secondary | tertiary | inverse
 *   variant     filled | outlined | elevated
 *   shape       none | extra-small | small | medium | large | extra-large
 *   icon-style  filled | tonal | surface | plain   (omit `icon` for no icon)
 *   icon-shape  none | small | medium | large | full
 *   layout      vertical | horizontal   (horizontal stacks below 600px of its own width)
 *   cta-label / cta-href / cta-icon     (omit `cta-href` to handle the click yourself)
 *
 * @example
 * <sky-feature-card color="primary" icon="card_giftcard" icon-style="surface"
 *   headline="Give the gift of wellness" text="Redeemable at 200+ partner spas."
 *   cta-label="Buy gift card" cta-href="/gift-cards"></sky-feature-card>
 */
export class SkyFeatureCard extends LitElement {
  static override properties = {
    icon: { type: String },
    headline: { type: String },
    text: { type: String },
    ctaLabel: { type: String, attribute: 'cta-label' },
    ctaHref: { type: String, attribute: 'cta-href' },
    ctaIcon: { type: String, attribute: 'cta-icon' },
    color: { type: String, reflect: true },
    variant: { type: String, reflect: true },
    shape: { type: String, reflect: true },
    iconStyle: { type: String, reflect: true, attribute: 'icon-style' },
    iconShape: { type: String, reflect: true, attribute: 'icon-shape' },
    layout: { type: String, reflect: true },
    slottedActions: { state: true },
  };

  declare icon?: string;
  declare headline?: string;
  declare text?: string;
  declare ctaLabel?: string;
  declare ctaHref?: string;
  declare ctaIcon?: string;
  declare color: SkyColor;
  declare variant: SkyVariant;
  declare shape: SkyShape;
  declare iconStyle: SkyIconStyle;
  declare iconShape: SkyShape;
  declare layout: 'vertical' | 'horizontal';
  declare slottedActions: boolean;

  constructor() {
    super();
    this.color = 'surface';
    this.variant = 'filled';
    this.shape = 'extra-large';
    this.iconStyle = 'filled';
    this.iconShape = 'medium';
    this.layout = 'vertical';
    this.slottedActions = false;
  }

  static override styles = css`
    ${hostBase}
    ${colorRoles}
    ${shapeScale}
    ${cardVariants}
    ${iconContainer}
    ${typeRoles}
    ${ctaButton}
    :host {
      block-size: 100%;
      container-type: inline-size;
    }
    .surface {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
      block-size: 100%;
      padding: 24px;
    }
    .copy {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-block-start: auto;
    }
    .actions[hidden] {
      display: none;
    }
    :host([layout='horizontal']) .surface {
      flex-direction: row;
      align-items: center;
      gap: 24px;
    }
    :host([layout='horizontal']) .copy {
      flex: 1;
      gap: 4px;
    }
    :host([layout='horizontal']) .actions {
      margin-block-start: 0;
      flex-shrink: 0;
    }
    @container (max-width: 600px) {
      :host([layout='horizontal']) .surface {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
      }
    }
  `;

  protected override render() {
    return html`
      <article class="surface">
        ${this.icon ? html`<span class="icon"><md-icon aria-hidden="true">${this.icon}</md-icon></span>` : nothing}
        <div class="copy">
          ${this.headline ? html`<h3 class="title-large">${this.headline}</h3>` : nothing}
          ${this.text ? html`<p class="body-large">${this.text}</p>` : nothing}
          <slot></slot>
        </div>
        <div class="actions" ?hidden=${!this.ctaLabel && !this.slottedActions}>
          <slot
            name="actions"
            @slotchange=${(e: Event) =>
              (this.slottedActions = (e.target as HTMLSlotElement).assignedElements().length > 0)}
          >
            ${this.ctaLabel
              ? html`<md-filled-button class="cta" href=${this.ctaHref ?? nothing} trailing-icon>
                  ${this.ctaLabel}
                  ${this.ctaIcon ? html`<md-icon slot="icon" aria-hidden="true">${this.ctaIcon}</md-icon>` : nothing}
                </md-filled-button>`
              : nothing}
          </slot>
        </div>
      </article>
    `;
  }
}

/**
 * <sky-cta-banner> — full-width horizontal call-to-action strip. Same options as
 * `sky-feature-card`, preset to `layout="horizontal"` and `shape="large"`.
 *
 * @example
 * <sky-cta-banner color="inverse" icon="card_giftcard" icon-style="tonal" icon-shape="full"
 *   headline="Give the gift of wellness" text="Gift cards work at 200+ partner spas."
 *   cta-label="Buy gift card" cta-href="/gift-cards"></sky-cta-banner>
 */
export class SkyCtaBanner extends SkyFeatureCard {
  constructor() {
    super();
    this.layout = 'horizontal';
    this.shape = 'large';
  }
}

if (!customElements.get('sky-feature-card')) {
  customElements.define('sky-feature-card', SkyFeatureCard);
}
if (!customElements.get('sky-cta-banner')) {
  customElements.define('sky-cta-banner', SkyCtaBanner);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-feature-card': SkyFeatureCard;
    'sky-cta-banner': SkyCtaBanner;
  }
}
