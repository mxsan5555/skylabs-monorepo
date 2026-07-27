/**
 * @skylabs-monorepo/shared-ui
 *
 * Framework-agnostic Material 3 component layer shared by every app.
 * Importing this module registers all Material Web elements and the team's
 * custom LIT components as custom elements, so any framework can use the
 * `<md-*>` and `<sky-*>` tags. React apps additionally import typed wrappers
 * from `@skylabs-monorepo/shared-ui/react`.
 *
 *   import '@skylabs-monorepo/shared-ui';            // register all elements
 *   import { applyTheme } from '@skylabs-monorepo/shared-ui';
 */

// Side-effect: register all Material Web (M3) elements.
import './material/index.js';

// Side-effect: register custom in-house elements, and export their classes.
export * from './components/index.js';

// Theme utilities.
export * from './theme/apply-theme.js';
