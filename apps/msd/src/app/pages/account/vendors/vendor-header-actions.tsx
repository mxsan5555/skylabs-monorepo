import { createElement, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import '@skylabs-monorepo/shared-ui';
import type { VendorStatus } from '../../../../api/rbac/vendors';
import { REMIND_NOW_LABEL, availableStatusActions, type StatusAction } from './vendor-status';

export interface VendorHeaderActionsProps {
  status: VendorStatus;
  /** `can('members', 'status_change')`. */
  canStatusChange: boolean;
  /** `can('members', 'delete')`. */
  canDelete: boolean;
  /** Prefill for the Suspend reason, "Documents not completed" when the review flag is set. */
  reasonPrefill: string;
  onChangeStatus: (status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason: string) => Promise<void>;
  onDelete: (reason: string) => Promise<void>;
  /** "Remind now" about missing documents. Omitted when the member cannot be reminded. */
  onRemind?: () => Promise<void>;
}

const COPY: Record<StatusAction, { button: string; confirm: string; title: string; body: string }> = {
  deactivate: {
    button: 'Make inactive',
    confirm: 'Confirm make inactive',
    title: 'Make this vendor inactive',
    body: 'The vendor can still log in and look at everything, but cannot change anything. Their items are hidden from the website. They get an email and an SMS with this reason.',
  },
  suspend: {
    button: 'Suspend',
    confirm: 'Confirm suspend',
    title: 'Suspend this vendor',
    body: 'The vendor cannot log in and everything they own disappears from the website. They get an email and an SMS with this reason and the steps to come back.',
  },
  reactivate: {
    button: 'Reactivate',
    confirm: 'Confirm reactivate',
    title: 'Reactivate this vendor',
    body: 'The vendor can log in again and everything on the website comes back as it was. They get an email and an SMS.',
  },
  delete: {
    button: 'Delete',
    confirm: 'Confirm delete',
    title: 'Delete this vendor',
    body: 'Nothing is erased: the vendor, their listings and files are archived and hidden everywhere. Find them under the Archived filter to restore them later. They get an email and an SMS.',
  },
  restore: {
    button: 'Restore',
    confirm: 'Confirm restore',
    title: 'Restore this vendor',
    body: 'The vendor comes back as Inactive: they can log in and look at everything, and nothing shows on the website until you reactivate them. They get an email and an SMS.',
  },
};

const TARGET_STATUS: Record<Exclude<StatusAction, 'delete'>, 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'> = {
  deactivate: 'INACTIVE',
  suspend: 'SUSPENDED',
  reactivate: 'ACTIVE',
  restore: 'INACTIVE',
};

// These limits mirror the reason schema in msd-api.
const MIN = 10;
const MAX = 500;

/**
 * Status buttons for the member detail header plus an inline confirm panel with a reason field.
 * Raw M3 elements: the @lit/react wrappers do not set properties under jsdom, so tests could not
 * drive them. Same convention as vendor-new-page.tsx.
 */
export function VendorHeaderActions({ status, canStatusChange, canDelete, reasonPrefill, onChangeStatus, onDelete, onRemind }: VendorHeaderActionsProps) {
  const actions = availableStatusActions(status, { canStatusChange, canDelete });
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [error, setError] = useState('');
  const reasonRef = useRef<HTMLElement | null>(null);
  const triggerRefs = useRef<Partial<Record<StatusAction, HTMLElement | null>>>({});
  const lastTrigger = useRef<StatusAction | null>(null);
  const wasOpen = useRef(false);
  const panelId = useId();
  const titleId = useId();
  const hintId = useId();

  // Focus the reason field on open; return focus to the trigger (or the first action left) on close.
  useEffect(() => {
    if (pending) {
      wasOpen.current = true;
      reasonRef.current?.focus();
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const back = (lastTrigger.current && triggerRefs.current[lastTrigger.current]) || Object.values(triggerRefs.current).find(Boolean);
    // The trigger re-renders as an outlined button when its panel closes: focus it once it has drawn.
    const ready = (back as (HTMLElement & { updateComplete?: Promise<unknown> }) | undefined)?.updateComplete;
    if (ready) void ready.then(() => back?.focus());
    else back?.focus();
  }, [pending]);

  if (actions.length === 0) return null;

  const open = (action: StatusAction) => {
    setError('');
    setReason(action === 'suspend' ? reasonPrefill : '');
    lastTrigger.current = action;
    setPending(action);
  };

  const close = () => {
    setPending(null);
    setReason('');
    setError('');
  };

  const text = reason.trim();
  const valid = text.length >= MIN && text.length <= MAX;

  const confirm = async () => {
    if (!pending || !valid) return;
    setBusy(true);
    setError('');
    try {
      if (pending === 'delete') await onDelete(text);
      else await onChangeStatus(TARGET_STATUS[pending], text);
      close();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      close();
    }
  };

  const copy = pending ? COPY[pending] : null;

  return (
    <div className="vendor-actions">
      <div className="page-head__actions">
        {actions.map(({ action, blockedBy }) =>
          // Outlined until chosen: only the action whose panel is open is filled (item 6), so the
          // highlight always matches what is selected. A blocked step stays visible, disabled,
          // and names what has to happen first.
          createElement(
            pending === action ? 'md-filled-tonal-button' : 'md-outlined-button',
            {
              key: action,
              ref: (el: HTMLElement | null) => {
                triggerRefs.current[action] = el;
              },
              disabled: Boolean(blockedBy) || undefined,
              'aria-expanded': pending === action ? 'true' : 'false',
              ...(pending === action ? { 'aria-controls': panelId } : {}),
              ...(blockedBy ? { 'aria-describedby': `${hintId}-${action}` } : {}),
              onClick: () => !blockedBy && open(action),
            },
            COPY[action].button,
          ),
        )}
        {onRemind &&
          createElement(
            'md-outlined-button',
            {
              disabled: reminding,
              onClick: async () => {
                setReminding(true);
                try {
                  await onRemind();
                } finally {
                  setReminding(false);
                }
              },
            },
            createElement('md-icon', { slot: 'icon', 'aria-hidden': 'true' }, 'notifications_active'),
            REMIND_NOW_LABEL,
          )}
      </div>
      {actions
        .filter((option) => option.blockedBy)
        .map(({ action, blockedBy }) => (
          <p key={action} id={`${hintId}-${action}`} className="vendor-actions__hint body-small">
            {blockedBy}
          </p>
        ))}

      {copy && pending && (
        // A labelled group with its own h2: it sits right under the page h1, so an h3 here (what a
        // sky-feature-card headline renders) would skip a level.
        <div id={panelId} role="group" aria-labelledby={titleId} className="vendor-actions__confirm" onKeyDown={onKeyDown}>
          <h2 id={titleId} className="vendor-actions__title title-medium">
            {copy.title}
          </h2>
          <p className="vendor-actions__body">{copy.body}</p>
          {createElement('md-outlined-text-field', {
            ref: (el: HTMLElement | null) => {
              reasonRef.current = el;
            },
            'data-testid': 'status-reason',
            label: `Reason (${MIN} to ${MAX} characters)`,
            type: 'textarea',
            rows: 3,
            required: true,
            maxlength: MAX,
            value: reason,
            onInput: (e: { currentTarget: { value: string } }) => setReason(e.currentTarget.value),
          })}
          {error && (
            <p className="error-state" role="alert">
              {error}
            </p>
          )}
          <div className="vendor-actions__buttons">
            {createElement('md-filled-button', { disabled: busy || !valid, onClick: confirm }, copy.confirm)}
            {createElement('md-text-button', { disabled: busy, onClick: close }, 'Cancel')}
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorHeaderActions;
