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
    color: var(--md-sys-color-on-surface, #1a1c19);
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
`;
