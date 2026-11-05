import type { SkySnackbar, SkySnackbarVariant } from '@skylabs-monorepo/shared-ui';

export interface SnackbarOptions {
  /** Defaults to `neutral`. Use `success` after an API call confirmed, `error` for failures. */
  variant?: SkySnackbarVariant;
  /** Text action button (for example "View Cart"). Fires `onAction`, then closes. */
  actionLabel?: string;
  onAction?: () => void;
  /** Close icon button. Defaults to `true` for `error`, `false` otherwise. */
  closable?: boolean;
  /** Auto-dismiss delay in ms. `0` keeps it open until dismissed. Defaults to the component's default. */
  duration?: number;
}

let host: SkySnackbar | null = null;
let pendingAction: (() => void) | undefined;
/** The element's own default `duration`, read once at mount so there is one source of truth. */
let defaultDuration: number | undefined;

function registerHost(el: HTMLElement | null) {
  host = el as SkySnackbar | null;
  defaultDuration ??= host?.duration;
}

function handleAction() {
  const run = pendingAction;
  pendingAction = undefined;
  run?.();
}

/**
 * The one `<sky-snackbar>` for the whole app (M3: one snackbar visible at a time). Mounted once
 * in `app.tsx`; every screen shows messages through `showSnackbar()` below instead of rendering
 * its own element. Rendered as a sibling of the route tree so it also works when the
 * `ErrorBoundary` fallback is showing.
 */
export function SnackbarHost() {
  return <sky-snackbar ref={registerHost} onsky-action={handleAction} />;
}

/**
 * Shows a message on the app's `<sky-snackbar>`. Call it only after the action it reports has
 * actually completed (right after the awaited API call resolves), never before. Every option is
 * reset on each call, so a previous message's action button or close icon never leaks into the
 * next one. A new call replaces the message currently visible.
 *
 * Keep messages to one line; the component collapses line breaks.
 */
export function showSnackbar(message: string, options: SnackbarOptions = {}): void {
  if (!host) return;
  const variant = options.variant ?? 'neutral';
  pendingAction = options.onAction;
  if (typeof host.show !== 'function') {
    // Custom element not registered (unit tests without shared-ui): keep the text reachable.
    host.textContent = message;
    return;
  }
  host.variant = variant;
  host.closable = options.closable ?? variant === 'error';
  host.actionLabel = options.actionLabel;
  host.duration = options.duration ?? defaultDuration ?? host.duration;
  host.show(message);
}
