import { css } from 'lit';

/**
 * Shared style fragments for the in-house `sky-*` components.
 *
 * Every value is a token from `theme/base.css` (shape, type, motion, state,
 * elevation) or an app theme file (`--md-sys-color-*`), so components hold no
 * brand or magic values. Compose with `css` interpolation:
 *
 *   static styles = css`${hostBase} ${typescale} .card { … }`;
 */

/** Block-level, full-width host on the M3 body font. */
export const hostBase = css`
  :host {
    display: block;
    inline-size: 100%;
    box-sizing: border-box;
    font-family: var(--md-sys-typescale-body-medium-font);
    color: var(--md-sys-color-on-surface);
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  [hidden] {
    display: none !important;
  }
`;

/**
 * Keyboard focus indicator: 3px primary outline, 2px offset.
 * Usage: `.trigger:focus-visible { ${focusRing} }`.
 */
export const focusRing = css`
  outline: 3px solid var(--md-sys-color-primary);
  outline-offset: 2px;
`;

/**
 * Whole-card link: one focusable anchor stretched over a `position: relative` parent.
 * The focus ring sits inside the edge so an `overflow: hidden` parent cannot clip it.
 */
export const stretchLink = css`
  .stretch {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
  }
  .stretch:focus-visible {
    ${focusRing}
    outline-offset: -3px;
  }
`;

/** Visually hidden, still announced by screen readers. */
export const srOnly = css`
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
`;

/**
 * `align="left|center|right"` (or `start`) → `text-align` on the host plus
 * `--_align` for flex containers (`align-items` / `justify-content`).
 */
export const alignment = css`
  :host {
    --_align: flex-start;
  }
  :host([align='center']) {
    --_align: center;
    text-align: center;
  }
  :host([align='right']) {
    --_align: flex-end;
    text-align: right;
  }
`;

/** Primary pill label over media (product-card badge, category-card tag). */
export const pill = css`
  .pill {
    position: absolute;
    inset-block-start: 10px;
    inset-inline-start: 10px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: var(--md-sys-shape-corner-full);
    background-color: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: 600;
  }
`;

/** Media frame that crops its image to fill (`<figure class="media"><img>`). */
export const coverImage = css`
  .media {
    position: relative;
    margin: 0;
    overflow: hidden;
    background-color: var(--md-sys-color-surface-variant);
  }
  .media img {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }
`;

/** M3 type roles as classes. Typography only; colour stays with the component. The same
 *  classes exist globally in `theme/base.css` for light DOM markup. */
export const typescale = css`
  .title-large,
  .title-medium,
  .title-small,
  .body-large,
  .body-medium,
  .body-small,
  .label-large,
  .label-medium,
  .label-small {
    margin: 0;
  }
  .title-large {
    font-family: var(--md-sys-typescale-title-large-font);
    font-size: var(--md-sys-typescale-title-large-size);
    line-height: var(--md-sys-typescale-title-large-line-height);
    font-weight: var(--md-sys-typescale-title-large-weight);
    letter-spacing: var(--md-sys-typescale-title-large-tracking);
  }
  .title-medium {
    font-family: var(--md-sys-typescale-title-medium-font);
    font-size: var(--md-sys-typescale-title-medium-size);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);
  }
  .title-small {
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
    line-height: var(--md-sys-typescale-title-small-line-height);
    font-weight: var(--md-sys-typescale-title-small-weight);
    letter-spacing: var(--md-sys-typescale-title-small-tracking);
  }
  .body-large {
    font-family: var(--md-sys-typescale-body-large-font);
    font-size: var(--md-sys-typescale-body-large-size);
    line-height: var(--md-sys-typescale-body-large-line-height);
    letter-spacing: var(--md-sys-typescale-body-large-tracking);
  }
  .body-medium {
    font-family: var(--md-sys-typescale-body-medium-font);
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  }
  .body-small {
    font-family: var(--md-sys-typescale-body-small-font);
    font-size: var(--md-sys-typescale-body-small-size);
    line-height: var(--md-sys-typescale-body-small-line-height);
    letter-spacing: var(--md-sys-typescale-body-small-tracking);
  }
  .label-large {
    font-family: var(--md-sys-typescale-label-large-font);
    font-size: var(--md-sys-typescale-label-large-size);
    line-height: var(--md-sys-typescale-label-large-line-height);
    font-weight: var(--md-sys-typescale-label-large-weight);
    letter-spacing: var(--md-sys-typescale-label-large-tracking);
  }
  .label-medium {
    font-family: var(--md-sys-typescale-label-medium-font);
    font-size: var(--md-sys-typescale-label-medium-size);
    line-height: var(--md-sys-typescale-label-medium-line-height);
    font-weight: var(--md-sys-typescale-label-medium-weight);
    letter-spacing: var(--md-sys-typescale-label-medium-tracking);
  }
  .label-small {
    font-family: var(--md-sys-typescale-label-small-font);
    font-size: var(--md-sys-typescale-label-small-size);
    line-height: var(--md-sys-typescale-label-small-line-height);
    font-weight: var(--md-sys-typescale-label-small-weight);
    letter-spacing: var(--md-sys-typescale-label-small-tracking);
  }
`;

let idCounter = 0;
/** Stable, unique id for wiring aria-controls / aria-labelledby inside a shadow root. */
export const nextId = (prefix: string): string => `${prefix}-${++idCounter}`;
