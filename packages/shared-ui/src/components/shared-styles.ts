import { css } from 'lit';

/**
 * Shared host reset for the in-house card / panel components.
 *
 * Centralises the block-level, full-width, M3-typeface baseline so each
 * component declares only what is unique to it (DRY). Compose it at the top of a
 * component's styles via `css` interpolation:
 *
 *   static styles = css`${hostBase} .card { … }`;
 */
export const hostBase = css`
  :host {
    display: block;
    width: 100%;
    box-sizing: border-box;
    font-family: var(--md-sys-typescale-body-medium-font, 'Roboto', sans-serif);
    color: var(--md-sys-color-on-surface);
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
`;

/**
 * Standard M3 focus-visible ring (3 px, primary colour, AA-compliant).
 * Apply to any interactive element that needs a visible keyboard focus indicator.
 *
 * Usage: add to a selector block —
 *   .trigger:focus-visible { ${focusRing} }
 *
 * For inset rings (inside a border), set outline-offset: -2px in the component.
 */
export const focusRing = css`
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
`;

/**
 * Stretched-link pattern used by sky-image-card and sky-category-card.
 * The anchor covers the entire card and carries the accessible name.
 */
export const stretchLink = css`
  .stretch {
    position: absolute;
    inset: 0;
    z-index: 2;
  }
  .stretch:focus-visible {
    outline: 3px solid var(--md-sys-color-primary);
    outline-offset: 2px;
  }
`;
