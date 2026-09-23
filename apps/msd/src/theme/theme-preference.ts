import { applySystemTheme, applyTheme, prefersContrast } from '@skylabs-monorepo/shared-ui';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'msd.theme';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
let stopSync: (() => void) | null = null;

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return value && PREFERENCES.includes(value) ? value : 'light';
  } catch {
    return 'light';
  }
}

/** Apply an explicit mode, re-applying whenever the OS contrast setting changes. */
function applyExplicitTheme(mode: 'light' | 'dark'): () => void {
  const set = () => applyTheme(mode, prefersContrast());
  set();
  const mq = window.matchMedia('(prefers-contrast: more)');
  mq.addEventListener('change', set);
  return () => mq.removeEventListener('change', set);
}

function apply(preference: ThemePreference) {
  stopSync?.();
  stopSync = preference === 'system' ? applySystemTheme() : applyExplicitTheme(preference);
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
