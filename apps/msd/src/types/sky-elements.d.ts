/**
 * JSX type declarations for sky-* LIT web components.
 *
 * These elements are registered globally by `import '@skylabs-monorepo/shared-ui'`
 * in main.tsx. This file only teaches TSX about the tags and their props so raw
 * `<sky-*>` tags type-check without `any`.
 *
 * React 19 passes unknown camelCase props as DOM properties, which LIT reads
 * natively — so prop names here match the LIT class property names (camelCase),
 * not the HTML attribute names (kebab-case).
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type SkyEl<T = object> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & T;

/** M3 surface options shared by sky-image / sky-tile-card / sky-feature-card / sky-cta-banner. */
type SkySurface = {
  color?: 'none' | 'surface' | 'surface-high' | 'primary' | 'secondary' | 'tertiary' | 'inverse';
  variant?: 'filled' | 'outlined' | 'elevated';
  shape?: 'none' | 'extra-small' | 'small' | 'medium' | 'large' | 'extra-large' | 'full';
};
type SkyIconOptions = {
  icon?: string;
  iconStyle?: 'filled' | 'tonal' | 'surface' | 'plain';
  iconShape?: 'none' | 'small' | 'medium' | 'large' | 'full';
  /** Attribute forms; survive server rendering / prerendering. */
  'icon-style'?: 'filled' | 'tonal' | 'surface' | 'plain';
  'icon-shape'?: 'none' | 'small' | 'medium' | 'large' | 'full';
};
type SkyFeatureProps = SkySurface &
  SkyIconOptions & {
    headline?: string;
    text?: string;
    ctaLabel?: string;
    ctaHref?: string;
    ctaIcon?: string;
    /** Attribute forms; survive server rendering / prerendering. */
    'cta-label'?: string;
    'cta-href'?: string;
    'cta-icon'?: string;
    layout?: 'vertical' | 'horizontal';
  };

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // ── sky-badge ──────────────────────────────────────────────────────────
      'sky-badge': SkyEl<{
        variant?: 'primary' | 'secondary' | 'tertiary' | 'error' | string;
        size?: 'small' | 'medium' | 'large' | string;
      }>;

      // ── sky-card ───────────────────────────────────────────────────────────
      'sky-card': SkyEl<{
        variant?: 'filled' | 'outlined' | 'elevated';
      }>;

      // ── sky-product-card ───────────────────────────────────────────────────
      'sky-product-card': SkyEl<{
        image?: string;
        imageAlt?: string;
        gallery?: string[];
        variant?: 'plain' | 'outlined';
        badge?: string;
        favorite?: boolean;
        favoriteActive?: boolean;
        tag?: string;
        tagIcon?: string;
        eyebrow?: string;
        heading?: string;
        location?: string;
        distance?: string;
        rating?: number;
        reviews?: number;
        score?: number;
        scoreLabel?: string;
        price?: string;
        originalPrice?: string;
        discount?: string;
        pricePrefix?: string;
        priceNote?: string;
        href?: string;
        align?: 'left' | 'center' | 'right';
        layout?: 'vertical' | 'horizontal';
      }>;

      // ── sky-image-card ─────────────────────────────────────────────────────
      'sky-image-card': SkyEl<{
        image?: string;
        imageAlt?: string;
        label?: string;
        href?: string;
        ratio?: string;
        align?: 'left' | 'center' | 'right';
      }>;

      // ── sky-category-card ──────────────────────────────────────────────────
      'sky-category-card': SkyEl<{
        image?: string;
        imageAlt?: string;
        heading?: string;
        subheading?: string;
        href?: string;
        align?: 'left' | 'center' | 'right';
        tag?: string;
      }>;

      // ── sky-info-card ──────────────────────────────────────────────────────
      'sky-info-card': SkyEl<{
        icon?: string;
        heading?: string;
        subheading?: string;
        align?: 'left' | 'center' | 'right';
        media?: string;
      }>;

      // ── sky-accordion ──────────────────────────────────────────────────────
      'sky-accordion': SkyEl<{
        single?: boolean;
      }>;

      // ── sky-accordion-item ─────────────────────────────────────────────────
      'sky-accordion-item': SkyEl<{
        header?: string;
        open?: boolean;
        disabled?: boolean;
        variant?: 'outlined' | 'filled' | 'elevated';
        level?: number;
      }>;

      // ── sky-action-field ───────────────────────────────────────────────────
      'sky-action-field': SkyEl<{
        label?: string;
        placeholder?: string;
        value?: string;
        name?: string;
        type?: 'text' | 'search' | 'email' | 'tel' | 'url' | 'number';
        autocomplete?: string;
        enterkeyhint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
        icon?: string;
        actionLabel?: string;
        /** Attribute form of `actionLabel`; survives server rendering / prerendering. */
        'action-label'?: string;
        actionIcon?: string;
        variant?: 'filled' | 'outlined';
        shape?: 'none' | 'extra-small' | 'small' | 'medium' | 'large' | 'extra-large' | 'full';
        dense?: boolean;
        required?: boolean;
        disabled?: boolean;
        /** React 19 attaches on<event> props on custom elements as listeners. */
        'onsky-submit'?: (event: CustomEvent<{ value: string }>) => void;
      }>;

      // ── sky-data-table ─────────────────────────────────────────────────────
      'sky-data-table': SkyEl<{
        caption?: string;
        columns?: string;
        rows?: string;
        total?: number;
        page?: number;
        /** Attribute: page-size */
        'page-size'?: number;
        loading?: boolean;
        searchable?: boolean;
        /** Attribute: search-placeholder */
        'search-placeholder'?: string;
        /** Attribute: filter-label */
        'filter-label'?: string;
        /** Attribute: filter-options */
        'filter-options'?: string;
        selectable?: boolean;
        actions?: string;
        exportable?: boolean;
      }>;

      // ── sky-image ──────────────────────────────────────────────────────────
      'sky-image': SkyEl<
        SkySurface & {
          src?: string;
          alt?: string;
          href?: string;
          label?: string;
          ratio?: string;
          fit?: 'cover' | 'contain';
          placeholderIcon?: string;
        }
      >;

      // ── sky-tile-card ──────────────────────────────────────────────────────
      'sky-tile-card': SkyEl<
        SkySurface &
          SkyIconOptions & { headline?: string; text?: string; href?: string; align?: 'start' | 'center' }
      >;

      // ── sky-feature-card / sky-cta-banner ──────────────────────────────────
      'sky-feature-card': SkyEl<SkyFeatureProps>;
      'sky-cta-banner': SkyEl<SkyFeatureProps>;
    }
  }
}
