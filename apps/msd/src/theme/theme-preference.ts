import { applySystemTheme, applyTheme, prefersContrast } from '@skylabs-monorepo/shared-ui';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'msd.theme';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
let stopSystemSync: (() => void) | null = null;

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return value && PREFERENCES.includes(value) ? value : 'light';
  } catch {
    return 'light';
  }
}

function apply(preference: ThemePreference) {
  stopSystemSync?.();
  stopSystemSync = null;
  if (preference === 'system') stopSystemSync = applySystemTheme();
  else applyTheme(preference, prefersContrast());
}

/** Apply and remember the visitor's choice. */
export function setThemePreference(preference: ThemePreference) {
  apply(preference);
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

/** Apply the saved choice at startup (default light). */
export function initThemePreference() {
  apply(readThemePreference());
}
