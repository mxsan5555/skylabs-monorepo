import { css, html } from 'lit';
import '@material/web/icon/icon.js';

/**
 * Shown in a card's `.media` frame when its image fails to load, instead of the browser's broken
 * image icon. The frame must be `position: relative`. The tint and icon follow the card's own
 * on-colour (`--_on-variant` when the card sets it), so it reads on any card colour.
 */
export const mediaPlaceholderStyles = css`
  .media__placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--_on-variant, var(--md-sys-color-on-surface-variant));
    background-color: color-mix(in srgb, currentColor 8%, transparent);
    --md-icon-size: 40px;
  }
`;

export const mediaPlaceholder = html`<span class="media__placeholder" aria-hidden="true"><md-icon>image</md-icon></span>`;
