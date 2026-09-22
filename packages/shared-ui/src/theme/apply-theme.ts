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

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;

/** Resolve the mode the OS currently prefers. */
export function prefersDark(): boolean {
  return matches('(prefers-color-scheme: dark)');
}

/** Resolve the contrast the OS currently asks for (`high` maps to the AAA theme variants). */
export function prefersContrast(): ThemeContrast {
  return matches('(prefers-contrast: more)') ? 'high' : 'standard';
}

/**
 * Apply the OS-preferred mode (and contrast, unless one is passed) now, and keep
 * both in sync when the OS settings change. Returns a cleanup function.
 */
export function applySystemTheme(
  contrast?: ThemeContrast,
  target: HTMLElement = document.documentElement,
): () => void {
  const set = () =>
    applyTheme(prefersDark() ? 'dark' : 'light', contrast ?? prefersContrast(), target);
  set();
  const queries = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)'].map((q) =>
    window.matchMedia(q),
  );
  queries.forEach((mq) => mq.addEventListener('change', set));
  return () => queries.forEach((mq) => mq.removeEventListener('change', set));
}
