import { css } from 'lit';
import { typescale } from './shared-styles.js';

/**
 * Shared Material 3 surface vocabulary for the in-house card components
 * (`sky-image`, `sky-tile-card`, `sky-feature-card`, `sky-cta-banner`, `sky-action-field`).
 *
 * Every visual option is an attribute that maps to an M3 system token, so the
 * components carry no brand values of their own:
 *
 *   color   → M3 color role pair (container + on-container + accent)
 *             none | surface | surface-high | primary | secondary | tertiary | inverse
 *   variant → M3 card type: filled | outlined | elevated
 *   shape   → M3 corner scale: none | extra-small | small | medium | large | extra-large | full
 *
 * Colours come from each app's theme files; shape, type and elevation from `theme/base.css`.
 */

/** Public option types, shared by every component that composes these styles. */
export type SkyColor = 'none' | 'surface' | 'surface-high' | 'primary' | 'secondary' | 'tertiary' | 'inverse';
export type SkyVariant = 'filled' | 'outlined' | 'elevated';
export type SkyShape = 'none' | 'extra-small' | 'small' | 'medium' | 'large' | 'extra-large' | 'full';
export type SkyIconStyle = 'filled' | 'tonal' | 'surface' | 'plain';

/**
 * `color` attribute → private custom properties consumed by the component CSS.
 *   --_container / --_on / --_on-variant   surface fill + text roles
 *   --_accent / --_on-accent               filled icon container + CTA button
 *   --_tonal / --_on-tonal                 tonal icon container
 *   --_outline                             outlined-variant border
 */
export const colorRoles = css`
  :host {
    --_container: var(--md-sys-color-surface-container-low);
    --_on: var(--md-sys-color-on-surface);
    --_on-variant: var(--md-sys-color-on-surface-variant);
    --_accent: var(--md-sys-color-primary);
    --_on-accent: var(--md-sys-color-on-primary);
    --_tonal: var(--md-sys-color-primary-container);
    --_on-tonal: var(--md-sys-color-on-primary-container);
    --_outline: var(--md-sys-color-outline-variant);
  }
  :host([color='none']) {
    --_container: transparent;
  }
  :host([color='surface-high']) {
    --_container: var(--md-sys-color-surface-container-high);
  }
  :host([color='primary']) {
    --_container: var(--md-sys-color-primary-container);
    --_on: var(--md-sys-color-on-primary-container);
    --_on-variant: var(--md-sys-color-on-primary-container);
    --_tonal: var(--md-sys-color-surface-container-lowest);
    --_on-tonal: var(--md-sys-color-primary);
  }
  :host([color='secondary']) {
    --_container: var(--md-sys-color-secondary-container);
    --_on: var(--md-sys-color-on-secondary-container);
    --_on-variant: var(--md-sys-color-on-secondary-container);
    --_accent: var(--md-sys-color-secondary);
    --_on-accent: var(--md-sys-color-on-secondary);
    --_tonal: var(--md-sys-color-surface-container-lowest);
    --_on-tonal: var(--md-sys-color-secondary);
  }
  :host([color='tertiary']) {
    --_container: var(--md-sys-color-tertiary-container);
    --_on: var(--md-sys-color-on-tertiary-container);
    --_on-variant: var(--md-sys-color-on-tertiary-container);
    --_accent: var(--md-sys-color-tertiary);
    --_on-accent: var(--md-sys-color-on-tertiary);
    --_tonal: var(--md-sys-color-surface-container-lowest);
    --_on-tonal: var(--md-sys-color-tertiary);
  }
  :host([color='inverse']) {
    --_container: var(--md-sys-color-inverse-surface);
    --_on: var(--md-sys-color-inverse-on-surface);
    --_on-variant: var(--md-sys-color-inverse-on-surface);
    --_accent: var(--md-sys-color-inverse-primary);
    --_on-accent: var(--md-sys-color-on-primary-fixed);
    --_tonal: var(--md-sys-color-primary);
    --_on-tonal: var(--md-sys-color-on-primary);
    --_outline: var(--md-sys-color-outline);
  }
`;

/** `shape` attribute → `--_shape` (M3 corner scale). Default: large. */
export const shapeScale = css`
  :host {
    --_shape: var(--md-sys-shape-corner-large);
  }
  :host([shape='none']) {
    --_shape: var(--md-sys-shape-corner-none);
  }
  :host([shape='extra-small']) {
    --_shape: var(--md-sys-shape-corner-extra-small);
  }
  :host([shape='small']) {
    --_shape: var(--md-sys-shape-corner-small);
  }
  :host([shape='medium']) {
    --_shape: var(--md-sys-shape-corner-medium);
  }
  :host([shape='extra-large']) {
    --_shape: var(--md-sys-shape-corner-extra-large);
  }
  :host([shape='full']) {
    --_shape: var(--md-sys-shape-corner-full);
  }
`;

/** `variant` attribute → M3 card type on the `.surface` element. */
export const cardVariants = css`
  .surface {
    position: relative;
    border-radius: var(--_shape);
    background-color: var(--_container);
    color: var(--_on);
    border: 1px solid transparent;
  }
  :host([variant='outlined']) .surface {
    border-color: var(--_outline);
  }
  :host([variant='elevated']) .surface {
    box-shadow: var(--sky-elevation-1);
  }
  /* M3 interactive-card state layer: md-ripple owns hover/press, md-focus-ring owns focus. */
  md-ripple {
    border-radius: var(--_shape);
    --md-ripple-hover-color: var(--_on);
    --md-ripple-pressed-color: var(--_on);
  }
  md-focus-ring {
    --md-focus-ring-shape: var(--_shape);
  }
  /* Whole-card link: one focusable anchor stretched over the surface. */
  .stretch {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: var(--_shape);
    outline: none;
  }
`;

/**
 * Icon container. `icon-style` picks the fill, `icon-shape` the corner (same
 * scale as `shape`, default medium). Size follows M3's 48dp container / 24dp icon.
 */
export const iconContainer = css`
  :host {
    --_icon-shape: var(--md-sys-shape-corner-medium);
  }
  .icon {
    display: inline-grid;
    place-items: center;
    flex-shrink: 0;
    inline-size: 48px;
    block-size: 48px;
    border-radius: var(--_icon-shape);
    background-color: var(--_accent);
    color: var(--_on-accent);
  }
  :host([icon-style='tonal']) .icon {
    background-color: var(--_tonal);
    color: var(--_on-tonal);
  }
  :host([icon-style='surface']) .icon {
    background-color: var(--md-sys-color-surface-container-lowest);
    color: var(--md-sys-color-primary);
  }
  :host([icon-style='plain']) .icon {
    inline-size: auto;
    block-size: auto;
    background-color: transparent;
    color: var(--_accent);
  }
  :host([icon-shape='none']) {
    --_icon-shape: var(--md-sys-shape-corner-none);
  }
  :host([icon-shape='small']) {
    --_icon-shape: var(--md-sys-shape-corner-small);
  }
  :host([icon-shape='large']) {
    --_icon-shape: var(--md-sys-shape-corner-large);
  }
  :host([icon-shape='full']) {
    --_icon-shape: var(--md-sys-shape-corner-full);
  }
`;

/** M3 type roles; supporting text takes the surface's on-variant colour. */
export const typeRoles = css`
  ${typescale}
  .body-medium,
  .body-large {
    color: var(--_on-variant);
  }
`;

/** Accent-coloured CTA: an md-filled-button re-tinted to the card's accent role. */
export const ctaButton = css`
  .cta {
    --md-filled-button-container-color: var(--_accent);
    --md-filled-button-label-text-color: var(--_on-accent);
    --md-filled-button-hover-label-text-color: var(--_on-accent);
    --md-filled-button-focus-label-text-color: var(--_on-accent);
    --md-filled-button-pressed-label-text-color: var(--_on-accent);
    --md-filled-button-icon-color: var(--_on-accent);
    --md-filled-button-hover-icon-color: var(--_on-accent);
    --md-filled-button-focus-icon-color: var(--_on-accent);
    --md-filled-button-pressed-icon-color: var(--_on-accent);
  }
`;
