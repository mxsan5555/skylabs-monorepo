import { LitElement, html, css, nothing } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import '@material/web/icon/icon.js';
import '@material/web/ripple/ripple.js';
import '@material/web/focus/md-focus-ring.js';
import { hostBase } from '../shared-styles.js';
import {
  cardVariants,
  colorRoles,
  iconContainer,
  shapeScale,
  typeRoles,
  type SkyColor,
  type SkyIconStyle,
  type SkyShape,
  type SkyVariant,
} from '../m3-surface.js';

/**
 * <sky-tile-card> — compact M3 card: icon container, headline and one line of supporting text.
 * Built for category / shortcut grids. With `href` the whole tile is one link carrying the
 * M3 state layer and focus ring.
 *
 * Options (all attributes, all mapped to M3 tokens):
 *   color       none | surface | surface-high | primary | secondary | tertiary | inverse
 *   variant     filled | outlined | elevated
 *   shape       none | extra-small | small | medium | large | extra-large
 *   icon-style  filled | tonal | surface | plain   (omit `icon` for no icon)
 *   icon-shape  none | small | medium | large | full
 *   align       start | center
 *
 * Use the `headline` slot to supply light-DOM heading markup (e.g. `<h3 slot="headline"><a href>…</a></h3>`)
 * as an SEO escape hatch when crawlers must see a real link; omit `href` then, since the slotted
 * link is the tile's link. In that case the consumer supplies the stretched-link CSS themselves
 * (a light-DOM `a::after { position: absolute; inset: 0; }` works because `.surface` is the
 * containing block) and loses the `md-ripple`/`md-focus-ring` state layer that `href` gets.
 * Prefer `href` when crawlability of the link itself isn't a requirement.
 *
 * With `href` and a slotted headline, the stretched link's `aria-labelledby` points at the
 * `<slot>`; Chromium resolves the slot's assigned nodes for the accessible name, other engines
 * vary. So when you use `href`, prefer the `headline` prop over the slot.
 *
 * @example
 * <sky-tile-card icon="healing" headline="Therapy" text="12 deals" href="/category/therapy"
 *   variant="outlined"></sky-tile-card>
 */
export class SkyTileCard extends LitElement {
  static override properties = {
    icon: { type: String },
    headline: { type: String },
    text: { type: String },
    href: { type: String },
    color: { type: String, reflect: true },
    variant: { type: String, reflect: true },
    shape: { type: String, reflect: true },
    iconStyle: { type: String, reflect: true, attribute: 'icon-style' },
    iconShape: { type: String, reflect: true, attribute: 'icon-shape' },
    align: { type: String, reflect: true },
    slottedHeadline: { state: true },
  };

  declare icon?: string;
  declare headline?: string;
  declare text?: string;
  declare href?: string;
  declare color: SkyColor;
  declare variant: SkyVariant;
  declare shape: SkyShape;
  declare iconStyle: SkyIconStyle;
  declare iconShape: SkyShape;
  declare align: 'start' | 'center';
  declare slottedHeadline: boolean;

  constructor() {
    super();
    this.color = 'surface';
    this.variant = 'outlined';
    this.shape = 'large';
    this.iconStyle = 'filled';
    this.iconShape = 'medium';
    this.align = 'start';
    this.slottedHeadline = false;
  }

  static override styles = css`
    ${hostBase}
    ${colorRoles}
    ${shapeScale}
    ${cardVariants}
    ${iconContainer}
    ${typeRoles}
    :host {
      block-size: 100%;
    }
    .surface {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      block-size: 100%;
      padding: 16px;
    }
    .icon {
      margin-block-end: 12px;
    }
    :host([align='center']) .surface {
      align-items: center;
      text-align: center;
    }
  `;

  protected override render() {
    // Only reference ids that actually exist in the rendered tree, so aria-labelledby never
    // dangles on an empty tile (headline via slot content or the fallback text; the <p id="text">
    // renders only when `text` is set).
    const labelledBy = [this.headline || this.slottedHeadline ? 'headline' : null, this.text ? 'text' : null]
      .filter((id): id is string => id !== null)
      .join(' ');

    return html`
      <article class="surface">
        ${this.icon ? html`<span class="icon"><md-icon aria-hidden="true">${this.icon}</md-icon></span>` : nothing}
        <slot
          name="headline"
          id="headline"
          @slotchange=${(e: Event) =>
            (this.slottedHeadline = (e.target as HTMLSlotElement).assignedElements().length > 0)}
        >
          ${this.headline ? html`<h3 class="title-medium">${this.headline}</h3>` : nothing}
        </slot>
        ${this.text ? html`<p id="text" class="body-medium">${this.text}</p>` : nothing}
        <slot></slot>
        ${this.href
          ? html`<a class="stretch" href=${this.href} aria-labelledby=${ifDefined(labelledBy || undefined)}>
              <md-ripple></md-ripple>
              <md-focus-ring></md-focus-ring>
            </a>`
          : nothing}
      </article>
    `;
  }
}

if (!customElements.get('sky-tile-card')) {
  customElements.define('sky-tile-card', SkyTileCard);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-tile-card': SkyTileCard;
  }
}
