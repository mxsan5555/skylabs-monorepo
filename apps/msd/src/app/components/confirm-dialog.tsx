import { useCallback, useEffect, useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, TextButton } from '@skylabs-monorepo/shared-ui/react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Promise-based replacement for `window.confirm()`, themed via the same M3 `Dialog` the
 * Showcase page demos (`/showcase#dialog`) instead of a native browser dialog. Renders one
 * dialog per call site — call `confirm(...)` from an event handler exactly like the old
 * `if (!window.confirm(msg)) return;` guard (just `await` it), then render `{ConfirmDialog}`
 * once anywhere in that component's JSX.
 *
 * The dialog stays mounted at all times (never conditionally rendered) so `dialogRef.current`
 * is never null on the very first call — same "always-mounted, toggled via an effect" pattern
 * used by this app's other imperative dialogs (see e.g. `TherapistPackagesDialog`'s own doc
 * comment on the identical ref-before-mount race).
 */
export function useConfirmDialog() {
  const dialogRef = useRef<MdDialog>(null);
  const [opts, setOpts] = useState<ConfirmOptions>({ message: '' });
  const [pending, setPending] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    setOpts(typeof options === 'string' ? { message: options } : options);
    setPending(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (pending) dialogRef.current?.show();
  }, [pending]);

  const settle = (result: boolean) => {
    dialogRef.current?.close();
    setPending(false);
    resolveRef.current?.(result);
    resolveRef.current = null;
  };

  const ConfirmDialog = (
    <Dialog ref={dialogRef} onClose={() => settle(false)}>
      <div slot="headline">{opts.title ?? 'Please confirm'}</div>
      <div slot="content">{opts.message}</div>
      <div slot="actions">
        <TextButton onClick={() => settle(false)}>{opts.cancelLabel ?? 'Cancel'}</TextButton>
        <FilledButton onClick={() => settle(true)}>{opts.confirmLabel ?? 'Confirm'}</FilledButton>
      </div>
    </Dialog>
  );

  return { confirm, ConfirmDialog };
}
