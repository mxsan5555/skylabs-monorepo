import { createElement, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import '@skylabs-monorepo/shared-ui';
import type { MemberStatus } from '../../../../api/rbac/members';
import { REMIND_NOW_LABEL, availableStatusActions, type StatusAction } from './member-status';

export interface MemberHeaderActionsProps {
  status: MemberStatus;
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
    title: 'Make this member inactive',
    body: 'The member can still log in and look at everything, but cannot change anything. Their items are hidden from the website.',
  },
  suspend: {
    button: 'Suspend',
    confirm: 'Confirm suspend',
    title: 'Suspend this member',
    body: 'The member cannot log in and everything they own disappears from the website. They get an email and an SMS with this reason and the steps to come back.',
  },
  reactivate: {
    button: 'Reactivate',
    confirm: 'Confirm reactivate',
    title: 'Reactivate this member',
    body: 'The member can log in again and everything on the website comes back as it was. They get an email and an SMS.',
  },
  delete: {
    button: 'Delete',
    confirm: 'Confirm delete',
    title: 'Delete this member',
    body: 'A member with no orders is removed for good. A member with orders is archived: hidden everywhere, records kept.',
  },
};

const TARGET_STATUS: Record<Exclude<StatusAction, 'delete'>, 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'> = {
  deactivate: 'INACTIVE',
  suspend: 'SUSPENDED',
  reactivate: 'ACTIVE',
};

// These limits mirror the reason schema in msd-api.
const MIN = 10;
const MAX = 500;

/**
 * Status buttons for the member detail header plus an inline confirm panel with a reason field.
 * Raw M3 elements: the @lit/react wrappers do not set properties under jsdom, so tests could not
 * drive them. Same convention as member-new-page.tsx.
 */
export function MemberHeaderActions({ status, canStatusChange, canDelete, reasonPrefill, onChangeStatus, onDelete, onRemind }: MemberHeaderActionsProps) {
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
    back?.focus();
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
    <div className="member-actions">
      <div className="page-head__actions">
        {actions.map((action) =>
          createElement(
            action === 'delete' || action === 'suspend' ? 'md-outlined-button' : 'md-filled-button',
            {
              key: action,
              ref: (el: HTMLElement | null) => {
                triggerRefs.current[action] = el;
              },
              'aria-expanded': pending === action ? 'true' : 'false',
              ...(pending === action ? { 'aria-controls': panelId } : {}),
              onClick: () => open(action),
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

      {copy && pending && (
        // A labelled group with its own h2: it sits right under the page h1, so an h3 here (what a
        // sky-feature-card headline renders) would skip a level.
        <div id={panelId} role="group" aria-labelledby={titleId} className="member-actions__confirm" onKeyDown={onKeyDown}>
          <h2 id={titleId} className="member-actions__title title-medium">
            {copy.title}
          </h2>
          <p className="member-actions__body">{copy.body}</p>
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
          <div className="member-actions__buttons">
            {createElement('md-filled-button', { disabled: busy || !valid, onClick: confirm }, copy.confirm)}
            {createElement('md-text-button', { disabled: busy, onClick: close }, 'Cancel')}
          </div>
        </div>
      )}
    </div>
  );
}

export default MemberHeaderActions;
