# Command: /new-shared-component

Adds a new custom component to `packages/shared-ui`. The component becomes available in both msd (React wrappers) and mera-driver (raw web component tags).

## Pipeline

1. **skylabs-neha** — Component spec
   - Purpose and when to use it vs existing components
   - Props/attributes with types and defaults
   - All states: default, hover, focus, active, disabled, loading, error
   - 60/30/10 colour mapping using `--md-sys-color-*` tokens
   - Responsive behaviour
   - Accessibility: ARIA role, keyboard interaction, contrast requirements

2. **skylabs-ravi** — Implementation
   - LIT component in `packages/shared-ui/src/components/<name>/`
   - Written **without decorators** (use `customElements.define(...)` directly) for cross-framework source compatibility
   - Use `--md-sys-color-*` tokens — never hard-code colours
   - Semantic HTML inside the shadow DOM (`figure`/`figcaption`, `article`, `button`, etc.)
   - Export from `packages/shared-ui/src/index.ts` barrel
   - React wrapper in `packages/shared-ui/src/react.ts`:
     ```ts
     export { default as SkyMyComponentReact } from './components/<name>/<name>.react';
     ```
   - Update `CLAUDE.md` shared-ui section with the new component docs

3. **skylabs-dev** — Unit test
   - Vitest test: `packages/shared-ui/src/components/<name>/<name>.test.ts`
   - First line: `installMaterialJsdomPolyfills()`
   - Cover: renders with required props, renders all slot content, keyboard interaction if interactive
   - Run: `npx nx run shared-ui:test`

## Usage

```
/new-shared-component [describe the component]
```

### Examples
```
/new-shared-component sky-rating — star rating display with accessible label, read-only and interactive variants
/new-shared-component sky-price-tag — price display with optional original price struck through and a discount badge
/new-shared-component sky-driver-card — driver listing card with avatar, name, rating, and vehicle type
```

## Constraints
- No app-specific logic in shared-ui — components are presentational only
- No decorators in LIT source — use `customElements.define()`
- All colour from `--md-sys-color-*` tokens — never hard-coded hex
- The React wrapper must be added for every new component (msd uses it)
- Build shared-ui before testing in apps: `npx nx build shared-ui`
