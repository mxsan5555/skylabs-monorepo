/**
 * Typed React wrappers for the Material 3 web components (React 19 + @lit/react).
 *
 * `createComponent` produces a real React component for each custom element,
 * giving typed props, refs, and DOM events mapped to React-style handlers
 * (e.g. `onInput`, `onChange`). Import these in the React app (msd) instead of
 * writing raw `<md-*>` tags:
 *
 *   import { FilledButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
 *
 * Importing this module also registers every underlying custom element.
 */

import * as React from 'react';
import { createComponent } from '@lit/react';

// Buttons
import { MdElevatedButton } from '@material/web/button/elevated-button.js';
import { MdFilledButton } from '@material/web/button/filled-button.js';
import { MdFilledTonalButton } from '@material/web/button/filled-tonal-button.js';
import { MdOutlinedButton } from '@material/web/button/outlined-button.js';
import { MdTextButton } from '@material/web/button/text-button.js';
// Checkbox
import { MdCheckbox } from '@material/web/checkbox/checkbox.js';
// Chips
import { MdChipSet } from '@material/web/chips/chip-set.js';
import { MdAssistChip } from '@material/web/chips/assist-chip.js';
import { MdFilterChip } from '@material/web/chips/filter-chip.js';
import { MdInputChip } from '@material/web/chips/input-chip.js';
import { MdSuggestionChip } from '@material/web/chips/suggestion-chip.js';
// Dialog
import { MdDialog } from '@material/web/dialog/dialog.js';
// FAB
import { MdFab } from '@material/web/fab/fab.js';
import { MdBrandedFab } from '@material/web/fab/branded-fab.js';
// Icon + Icon buttons
import { MdIcon } from '@material/web/icon/icon.js';
import { MdIconButton } from '@material/web/iconbutton/icon-button.js';
import { MdFilledIconButton } from '@material/web/iconbutton/filled-icon-button.js';
import { MdFilledTonalIconButton } from '@material/web/iconbutton/filled-tonal-icon-button.js';
import { MdOutlinedIconButton } from '@material/web/iconbutton/outlined-icon-button.js';
// Lists
import { MdList } from '@material/web/list/list.js';
import { MdListItem } from '@material/web/list/list-item.js';
// Menus
import { MdMenu } from '@material/web/menu/menu.js';
import { MdMenuItem } from '@material/web/menu/menu-item.js';
import { MdSubMenu } from '@material/web/menu/sub-menu.js';
// Progress
import { MdLinearProgress } from '@material/web/progress/linear-progress.js';
import { MdCircularProgress } from '@material/web/progress/circular-progress.js';
// Radio
import { MdRadio } from '@material/web/radio/radio.js';
// Ripple
import { MdRipple } from '@material/web/ripple/ripple.js';
// Select
import { MdFilledSelect } from '@material/web/select/filled-select.js';
import { MdOutlinedSelect } from '@material/web/select/outlined-select.js';
import { MdSelectOption } from '@material/web/select/select-option.js';
// Slider
import { MdSlider } from '@material/web/slider/slider.js';
// Switch
import { MdSwitch } from '@material/web/switch/switch.js';
// Tabs
import { MdTabs } from '@material/web/tabs/tabs.js';
import { MdPrimaryTab } from '@material/web/tabs/primary-tab.js';
import { MdSecondaryTab } from '@material/web/tabs/secondary-tab.js';
// Text field
import { MdFilledTextField } from '@material/web/textfield/filled-text-field.js';
import { MdOutlinedTextField } from '@material/web/textfield/outlined-text-field.js';
// Extras
import { MdDivider } from '@material/web/divider/divider.js';

// Custom in-house elements
import { SkyBadge } from './components/sky-badge/sky-badge.js';
import { SkyCard } from './components/sky-card/sky-card.js';
import { SkyProductCard } from './components/sky-product-card/sky-product-card.js';
import { SkyImageCard } from './components/sky-image-card/sky-image-card.js';
import { SkyCategoryCard } from './components/sky-category-card/sky-category-card.js';
import { SkyInfoCard } from './components/sky-info-card/sky-info-card.js';
import { SkyAccordion } from './components/sky-accordion/sky-accordion.js';
import { SkyAccordionItem } from './components/sky-accordion/sky-accordion-item.js';

const inputEvents = { onInput: 'input', onChange: 'change' } as const;
const dialogEvents = {
  onOpen: 'open',
  onOpening: 'opening',
  onClose: 'close',
  onClosing: 'closing',
  onCancel: 'cancel',
} as const;
const menuEvents = {
  onOpening: 'opening',
  onOpened: 'opened',
  onClosing: 'closing',
  onClosed: 'closed',
} as const;

// Buttons
export const ElevatedButton = createComponent({ react: React, tagName: 'md-elevated-button', elementClass: MdElevatedButton });
export const FilledButton = createComponent({ react: React, tagName: 'md-filled-button', elementClass: MdFilledButton });
export const FilledTonalButton = createComponent({ react: React, tagName: 'md-filled-tonal-button', elementClass: MdFilledTonalButton });
export const OutlinedButton = createComponent({ react: React, tagName: 'md-outlined-button', elementClass: MdOutlinedButton });
export const TextButton = createComponent({ react: React, tagName: 'md-text-button', elementClass: MdTextButton });

// Checkbox / Radio / Switch
export const Checkbox = createComponent({ react: React, tagName: 'md-checkbox', elementClass: MdCheckbox, events: inputEvents });
export const Radio = createComponent({ react: React, tagName: 'md-radio', elementClass: MdRadio, events: inputEvents });
export const Switch = createComponent({ react: React, tagName: 'md-switch', elementClass: MdSwitch, events: inputEvents });

// Chips
export const ChipSet = createComponent({ react: React, tagName: 'md-chip-set', elementClass: MdChipSet });
export const AssistChip = createComponent({ react: React, tagName: 'md-assist-chip', elementClass: MdAssistChip });
export const FilterChip = createComponent({ react: React, tagName: 'md-filter-chip', elementClass: MdFilterChip });
export const InputChip = createComponent({ react: React, tagName: 'md-input-chip', elementClass: MdInputChip });
export const SuggestionChip = createComponent({ react: React, tagName: 'md-suggestion-chip', elementClass: MdSuggestionChip });

// Dialog
export const Dialog = createComponent({ react: React, tagName: 'md-dialog', elementClass: MdDialog, events: dialogEvents });

// FAB
export const Fab = createComponent({ react: React, tagName: 'md-fab', elementClass: MdFab });
export const BrandedFab = createComponent({ react: React, tagName: 'md-branded-fab', elementClass: MdBrandedFab });

// Icon + icon buttons
export const Icon = createComponent({ react: React, tagName: 'md-icon', elementClass: MdIcon });
export const IconButton = createComponent({ react: React, tagName: 'md-icon-button', elementClass: MdIconButton });
export const FilledIconButton = createComponent({ react: React, tagName: 'md-filled-icon-button', elementClass: MdFilledIconButton });
export const FilledTonalIconButton = createComponent({ react: React, tagName: 'md-filled-tonal-icon-button', elementClass: MdFilledTonalIconButton });
export const OutlinedIconButton = createComponent({ react: React, tagName: 'md-outlined-icon-button', elementClass: MdOutlinedIconButton });

// Lists
export const List = createComponent({ react: React, tagName: 'md-list', elementClass: MdList });
export const ListItem = createComponent({ react: React, tagName: 'md-list-item', elementClass: MdListItem });

// Menus
export const Menu = createComponent({ react: React, tagName: 'md-menu', elementClass: MdMenu, events: menuEvents });
export const MenuItem = createComponent({ react: React, tagName: 'md-menu-item', elementClass: MdMenuItem });
export const SubMenu = createComponent({ react: React, tagName: 'md-sub-menu', elementClass: MdSubMenu });

// Progress
export const LinearProgress = createComponent({ react: React, tagName: 'md-linear-progress', elementClass: MdLinearProgress });
export const CircularProgress = createComponent({ react: React, tagName: 'md-circular-progress', elementClass: MdCircularProgress });

// Ripple
export const Ripple = createComponent({ react: React, tagName: 'md-ripple', elementClass: MdRipple });

// Select
export const FilledSelect = createComponent({ react: React, tagName: 'md-filled-select', elementClass: MdFilledSelect, events: inputEvents });
export const OutlinedSelect = createComponent({ react: React, tagName: 'md-outlined-select', elementClass: MdOutlinedSelect, events: inputEvents });
export const SelectOption = createComponent({ react: React, tagName: 'md-select-option', elementClass: MdSelectOption });

// Slider
export const Slider = createComponent({ react: React, tagName: 'md-slider', elementClass: MdSlider, events: inputEvents });

// Tabs
export const Tabs = createComponent({ react: React, tagName: 'md-tabs', elementClass: MdTabs, events: { onChange: 'change' } });
export const PrimaryTab = createComponent({ react: React, tagName: 'md-primary-tab', elementClass: MdPrimaryTab });
export const SecondaryTab = createComponent({ react: React, tagName: 'md-secondary-tab', elementClass: MdSecondaryTab });

// Text field
export const FilledTextField = createComponent({ react: React, tagName: 'md-filled-text-field', elementClass: MdFilledTextField, events: inputEvents });
export const OutlinedTextField = createComponent({ react: React, tagName: 'md-outlined-text-field', elementClass: MdOutlinedTextField, events: inputEvents });

// Extras
export const Divider = createComponent({ react: React, tagName: 'md-divider', elementClass: MdDivider });

// Custom in-house components
export const SkyBadgeReact = createComponent({ react: React, tagName: 'sky-badge', elementClass: SkyBadge });
export const SkyCardReact = createComponent({ react: React, tagName: 'sky-card', elementClass: SkyCard });
export const SkyProductCardReact = createComponent({ react: React, tagName: 'sky-product-card', elementClass: SkyProductCard, events: { onFavorite: 'favorite' } });
export const SkyImageCardReact = createComponent({ react: React, tagName: 'sky-image-card', elementClass: SkyImageCard });
export const SkyCategoryCardReact = createComponent({ react: React, tagName: 'sky-category-card', elementClass: SkyCategoryCard });
export const SkyInfoCardReact = createComponent({ react: React, tagName: 'sky-info-card', elementClass: SkyInfoCard });
export const SkyAccordionReact = createComponent({ react: React, tagName: 'sky-accordion', elementClass: SkyAccordion });
export const SkyAccordionItemReact = createComponent({ react: React, tagName: 'sky-accordion-item', elementClass: SkyAccordionItem, events: { onToggle: 'toggle' } });

// Re-export theme helpers for convenience in React apps.
export * from './theme/apply-theme.js';
