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
    }
  }
}
