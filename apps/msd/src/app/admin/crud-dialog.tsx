import type { ReactNode } from 'react';
import { Dialog, FilledButton, TextButton } from '@skylabs-monorepo/shared-ui/react';

interface CrudDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  error?: string | null;
  children: ReactNode;
}

/** Create/edit form shell over shared-ui's Dialog — every Master/Manage page reuses
 *  this instead of hand-rolling its own dialog chrome. */
export function CrudDialog({ open, title, onClose, onSave, saving, saveLabel = 'Save', error, children }: CrudDialogProps) {
  return (
    <Dialog open={open} onCancel={onClose}>
      <div slot="headline">{title}</div>
      <form slot="content" method="dialog" className="crud-dialog__form">
        {error && (
          <p className="crud-dialog__error" role="alert">
            {error}
          </p>
        )}
        {children}
      </form>
      <div slot="actions">
        <TextButton onClick={onClose}>Cancel</TextButton>
        <FilledButton onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : saveLabel}
        </FilledButton>
      </div>
    </Dialog>
  );
}
