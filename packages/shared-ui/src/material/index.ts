/**
 * Material Web (M3) element registration barrel.
 *
 * Each import below has a side effect: it calls `customElements.define(...)`
 * for one Material Design 3 web component. Import this module once per app
 * (`import '@skylabs-monorepo/shared-ui'`) to make every `<md-*>` tag below
 * usable in any framework. Components read their colors from the
 * `--md-sys-color-*` custom properties supplied by each app's own theme CSS,
 * so the same elements render in each app's brand palette.
 *
 * Covers all 15 component groups from https://material-web.dev.
 */

// Buttons
import '@material/web/button/elevated-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';

// Checkbox
import '@material/web/checkbox/checkbox.js';

// Chips
import '@material/web/chips/chip-set.js';
import '@material/web/chips/assist-chip.js';
import '@material/web/chips/filter-chip.js';
import '@material/web/chips/input-chip.js';
import '@material/web/chips/suggestion-chip.js';

// Dialogs
import '@material/web/dialog/dialog.js';

// Floating action button (FAB)
import '@material/web/fab/fab.js';
import '@material/web/fab/branded-fab.js';

// Icon + Icon Buttons
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/iconbutton/filled-icon-button.js';
import '@material/web/iconbutton/filled-tonal-icon-button.js';
import '@material/web/iconbutton/outlined-icon-button.js';

// Lists
import '@material/web/list/list.js';
import '@material/web/list/list-item.js';

// Menus
import '@material/web/menu/menu.js';
import '@material/web/menu/menu-item.js';
import '@material/web/menu/sub-menu.js';

// Progress indicators
import '@material/web/progress/linear-progress.js';
import '@material/web/progress/circular-progress.js';

// Radio
import '@material/web/radio/radio.js';

// Ripple
import '@material/web/ripple/ripple.js';

// Select
import '@material/web/select/filled-select.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';

// Sliders
import '@material/web/slider/slider.js';

// Switch
import '@material/web/switch/switch.js';

// Tabs
import '@material/web/tabs/tabs.js';
import '@material/web/tabs/primary-tab.js';
import '@material/web/tabs/secondary-tab.js';

// Text field
import '@material/web/textfield/filled-text-field.js';
import '@material/web/textfield/outlined-text-field.js';

// Extras commonly paired with the set
import '@material/web/divider/divider.js';
import '@material/web/elevation/elevation.js';
