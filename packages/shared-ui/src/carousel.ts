/**
 * Carousel — Swiper Element (web component) registration.
 *
 * Swiper ships its own framework-agnostic custom elements
 * (`<swiper-container>` / `<swiper-slide>`), so we don't wrap them in a bespoke
 * LIT component — that would only add surface for content that is app-specific
 * anyway. Importing this module once registers the elements; both apps then use
 * the raw tags directly (React renders custom elements natively; Angular needs
 * `CUSTOM_ELEMENTS_SCHEMA`).
 *
 * This is a SEPARATE entry (not part of the main barrel) so Swiper's bundle only
 * loads on pages that actually use a carousel.
 *
 * Brand theming is automatic: `theme/base.css` maps `--swiper-theme-color` to the
 * active app's `--md-sys-color-primary`, so pagination, scrollbar and navigation
 * inherit each app's palette (msd green / mera-driver blue).
 *
 * @example
 * import '@skylabs-monorepo/shared-ui/carousel';
 *
 * <swiper-container slides-per-view="auto" space-between="16" pagination="true">
 *   <swiper-slide>…</swiper-slide>
 * </swiper-container>
 */
import { register } from 'swiper/element/bundle';

// register() is idempotent — it no-ops if the elements are already defined.
register();
