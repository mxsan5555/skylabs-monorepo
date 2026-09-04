# Skill: shared-ui Usage

`@skylabs-monorepo/shared-ui` — Material 3 web components (LIT) shared by msd and mera-driver.

## One-Time Registration (per app)
```ts
// main.tsx (msd) or main.ts (mera-driver) — import once, registers all <md-*> + <sky-*> elements:
import '@skylabs-monorepo/shared-ui';
import '@skylabs-monorepo/shared-ui/theme.css';
import '@skylabs-monorepo/shared-ui/layout.css';  // app-shell / auth layout styles
```

## Theme
```ts
import { applyTheme } from '@skylabs-monorepo/shared-ui';
applyTheme('light');   // or 'dark', optional contrast: 'standard' | 'medium' | 'high'
```

## React (msd) — Typed Wrappers
Use typed wrappers from `@skylabs-monorepo/shared-ui/react`:
```tsx
import {
  FilledButton,
  OutlinedButton,
  SkyProductCardReact,
  SkyImageCardReact,
  SkyCategoryCardReact,
  SkyInfoCardReact,
  SkyAccordionReact,
  SkyAccordionItemReact,
} from '@skylabs-monorepo/shared-ui/react';
```
Raw `<md-*>` tags also work in JSX; types are declared in `apps/msd/src/types/swiper-elements.d.ts` and similar.

## Angular (mera-driver) — Raw Tags
Use raw `<md-*>` and `<sky-*>` tags in templates. Any component using them needs:
```ts
@Component({ schemas: [CUSTOM_ELEMENTS_SCHEMA], ... })
```

## M3 Built-in Components (use `<md-*>` directly)
```
Buttons:     md-filled-button · md-outlined-button · md-text-button · md-elevated-button · md-filled-tonal-button
FAB:         md-fab · md-extended-fab · md-branded-fab
Icon button: md-icon-button · md-filled-icon-button · md-filled-tonal-icon-button · md-outlined-icon-button
Inputs:      md-filled-text-field · md-outlined-text-field · md-filled-select · md-outlined-select
Chips:       md-assist-chip · md-filter-chip · md-input-chip · md-suggestion-chip
Lists:       md-list · md-list-item
Navigation:  md-navigation-bar · md-navigation-tab · md-navigation-drawer · md-navigation-drawer-modal
Dialog:      md-dialog
Progress:    md-circular-progress · md-linear-progress
Tabs:        md-tabs · md-primary-tab · md-secondary-tab
Controls:    md-checkbox · md-radio · md-switch · md-slider
Divider:     md-divider
```

## Custom In-House Components (sky-*)

### sky-product-card
```html
<sky-product-card
  image="/assets/deal.jpg"
  badge="20% off"
  heading="Swedish Massage"
  subheading="60 minutes"
  price="₹999"
  original-price="₹1249"
  rating="4.5"
  reviews="128"
  variant="outlined"
></sky-product-card>
```

### sky-image-card
```html
<sky-image-card
  src="/assets/banner.jpg"
  label="Relaxation Deals"
  href="/category/relaxation"
  ratio="16/9"
></sky-image-card>
```

### sky-category-card
```html
<sky-category-card
  src="/assets/cat-relaxation.jpg"
  heading="Relaxation"
  subheading="24 deals"
  href="/category/relaxation"
></sky-category-card>
```

### sky-info-card
```html
<sky-info-card
  icon="info"
  heading="No deals found"
  subheading="Try adjusting your search"
></sky-info-card>
```

### sky-accordion
```html
<sky-accordion single>
  <sky-accordion-item heading="What is included?">
    Full 60-minute session with trained therapist.
  </sky-accordion-item>
  <sky-accordion-item heading="Cancellation policy?">
    Cancel up to 24 hours in advance.
  </sky-accordion-item>
</sky-accordion>
```
`single` attribute keeps only one item open at a time.

### sky-badge
```html
<sky-badge label="New" color="primary"></sky-badge>
```

## Carousel (Swiper Element) — opt-in
Import only on pages/components that use a carousel (keeps Swiper out of the base bundle):
```ts
import '@skylabs-monorepo/shared-ui/carousel';
```
Then use raw tags:
```html
<swiper-container slides-per-view="auto" space-between="16" loop pagination>
  <swiper-slide>...</swiper-slide>
  <swiper-slide>...</swiper-slide>
</swiper-container>
```
Pagination/scrollbar/arrows automatically use the app's primary colour (`--md-sys-color-primary`).

## Icons
Self-hosted Material Symbols Outlined via the `material-symbols` package (imported in `theme/base.css`):
```html
<md-icon aria-hidden="true">favorite</md-icon>
<md-icon aria-hidden="true">star</md-icon>
```
Add `aria-hidden="true"` when decorative. Provide `aria-label` on the parent button instead.

## M3 Color Tokens (per app)

| Token | msd (green) | mera-driver (blue) |
|-------|-------------|-------------------|
| `--md-sys-color-primary` | #007C2B | #1175BC |
| `--md-sys-color-on-primary` | #FFFFFF | #FFFFFF |
| `--md-sys-color-secondary` | (tonal green) | (tonal blue) |
| `--md-sys-color-surface` | #FFFBFF | #FAFCFF |

Never override these tokens inline — edit the theme file only.

## Nx Commands
```bash
npx nx build shared-ui             # build the package
npx nx run shared-ui:test          # Vitest unit tests
```
