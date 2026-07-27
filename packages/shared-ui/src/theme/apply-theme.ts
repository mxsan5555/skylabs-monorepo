/**
 * Framework-agnostic Material 3 theme switcher.
 *
 * Each app ships its own Material Theme Builder CSS where the `--md-sys-color-*`
 * tokens are scoped under class selectors (`.light`, `.dark`,
 * `.light-medium-contrast`, etc.). This helper sets the matching class on
 * `<html>` so Material Web components pick up that app's palette. Because each
 * app only loads its own theme CSS, the same class name resolves to a
 * different brand color per app.
 */

export type ThemeMode = 'light' | 'dark';
export type ThemeContrast = 'standard' | 'medium' | 'high';

const ALL_THEME_CLASSES = [
  'light',
  'light-medium-contrast',
  'light-high-contrast',
  'dark',
  'dark-medium-contrast',
  'dark-high-contrast',
] as const;

export function themeClassName(
  mode: ThemeMode,
  contrast: ThemeContrast = 'standard',
): string {
  if (contrast === 'medium') return `${mode}-medium-contrast`;
  if (contrast === 'high') return `${mode}-high-contrast`;
  return mode;
}

/**
 * Apply a theme to the document root. Pass an explicit element to scope the
 * theme to a subtree instead of the whole page.
 */
export function applyTheme(
  mode: ThemeMode,
  contrast: ThemeContrast = 'standard',
  target: HTMLElement = document.documentElement,
): string {
  const next = themeClassName(mode, contrast);
  target.classList.remove(...ALL_THEME_CLASSES);
  target.classList.add(next);
  target.style.colorScheme = mode;
  return next;
}

/** Resolve the mode the OS currently prefers. */
export function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  );
}

/**
 * Convenience: apply the OS-preferred mode now and keep it in sync when the OS
 * setting changes. Returns a cleanup function that stops listening.
 */
export function applySystemTheme(
  contrast: ThemeContrast = 'standard',
  target: HTMLElement = document.documentElement,
): () => void {
  const set = () => applyTheme(prefersDark() ? 'dark' : 'light', contrast, target);
  set();
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', set);
  return () => mq.removeEventListener('change', set);
}
