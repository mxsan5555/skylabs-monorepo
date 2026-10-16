import { createElement, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import '@skylabs-monorepo/shared-ui';
import type { VendorDocumentType } from '../../../../api/rbac/vendors';
import {
  deleteMemberDocument,
  listMemberDocuments,
  reviewMemberDocument,
  uploadMemberDocument,
  type MemberDocumentRow,
  type MemberDocumentStatus,
} from '../../../../api/rbac/members';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { BadgeVariant } from './member-status';

const TYPES: { type: VendorDocumentType; label: string; numberLabel: string }[] = [
  { type: 'AADHAAR', label: 'Aadhaar card', numberLabel: 'Aadhaar number' },
  { type: 'PAN', label: 'PAN card', numberLabel: 'PAN number' },
  { type: 'GST', label: 'GST registration', numberLabel: 'GST number' },
];

type DocumentState = MemberDocumentStatus | 'MISSING';

const STATUS_LABEL: Record<DocumentState, string> = {
  MISSING: 'Missing',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

const STATUS_VARIANT: Record<DocumentState, BadgeVariant> = {
  MISSING: 'tertiary',
  SUBMITTED: 'secondary',
  APPROVED: 'primary',
  REJECTED: 'error',
  EXPIRED: 'error',
};

// These limits mirror the review schema in msd-api.
const REASON_MIN = 10;
const REASON_MAX = 500;
const REJECT_LABEL = `Rejection reason (${REASON_MIN} to ${REASON_MAX} characters)`;

export interface MemberDocumentsTabProps {
  token: string | null;
  memberId: string;
  /** `can('members', 'edit')`: upload, replace and remove. */
  canEdit: boolean;
  /** `can('members', 'approve')`. */
  canApprove: boolean;
  /** `can('members', 'reject')`. */
  canReject: boolean;
  /** Runs after every successful change, so the parent can refresh the documents chip and activity. */
  onChanged: () => void;
}

function message(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}

/**
 * Required documents (Aadhaar, PAN, GST) for one member. The API decides what each viewer sees:
 * Support gets type and status only, so the number and file name simply stay empty.
 * Raw M3 elements so tests can drive them (see member-new-page.tsx).
 */
export function MemberDocumentsTab({ token, memberId, canEdit, canApprove, canReject, onChanged }: MemberDocumentsTabProps) {
  const [rows, setRows] = useState<MemberDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState<Partial<Record<VendorDocumentType, string>>>({});
  const [rejecting, setRejecting] = useState<VendorDocumentType | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const rejectFieldRef = useRef<HTMLElement | null>(null);
  const rejectTriggerRefs = useRef<Partial<Record<VendorDocumentType, HTMLElement | null>>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await listMemberDocuments(token, memberId);
      setRows(data);
      setLoadError('');
    } catch (err) {
      setLoadError(message(err, 'Could not load documents.'));
    } finally {
      setLoading(false);
    }
  }, [token, memberId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (rejecting) rejectFieldRef.current?.focus();
  }, [rejecting]);

  const run = async (done: string, action: () => Promise<unknown>) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
      setNotice(done);
      await load();
      onChanged();
    } catch (err) {
      setError(message(err, 'That did not work. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const upload = (type: VendorDocumentType, file: File | undefined) => {
    if (!file) return;
    void run('Document uploaded for the member.', () => uploadMemberDocument(token, memberId, type, file, file.name, numbers[type]?.trim() || undefined));
  };

  const cancelReject = (type: VendorDocumentType) => {
    setRejecting(null);
    setRejectReason('');
    rejectTriggerRefs.current[type]?.focus();
  };

  const onRejectKeyDown = (type: VendorDocumentType) => (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      cancelReject(type);
    }
  };

  if (loading) return <p className="loading-state">Loading documents…</p>;
  if (loadError) {
    return (
      <p className="error-state" role="alert">
        {loadError}
      </p>
    );
  }

  const reasonText = rejectReason.trim();
  const reasonValid = reasonText.length >= REASON_MIN && reasonText.length <= REASON_MAX;

  return (
    <section className="admin-tab-panel" aria-label="Documents">
      {notice && (
        <p className="field-hint" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}

      <ul className="document-list">
        {TYPES.map(({ type, label, numberLabel }) => {
          const row = rows.find((r) => r.documentType === type);
          const state: DocumentState = row?.status ?? 'MISSING';
          return (
            <li key={type} className="document-row">
              <div className="document-row__info">
                <h3>{label}</h3>
                <sky-badge variant={STATUS_VARIANT[state]}>{STATUS_LABEL[state]}</sky-badge>
                {row?.numberMasked && <p>{row.numberMasked}</p>}
                {row?.uploadedOnBehalf && <p className="field-hint">Uploaded by staff for the member</p>}
                {row?.status === 'REJECTED' && row.rejectionReason && <p className="error-state">Rejected: {row.rejectionReason}</p>}
                {row?.originalFilename && <p className="field-hint">{row.originalFilename}</p>}
              </div>

              {canEdit && (
                <div className="document-row__upload">
                  {createElement('md-outlined-text-field', {
                    label: numberLabel,
                    value: numbers[type] ?? '',
                    autocomplete: 'off',
                    onInput: (e: { currentTarget: { value: string } }) => {
                      const { value } = e.currentTarget;
                      setNumbers((n) => ({ ...n, [type]: value }));
                    },
                  })}
                  <label className="document-row__file">
                    {`${row ? 'Replace' : 'Upload'} ${label} file`}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      disabled={busy}
                      onChange={(e) => {
                        upload(type, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {row &&
                    row.status !== 'APPROVED' &&
                    createElement(
                      'md-text-button',
                      { disabled: busy, onClick: () => run('Document removed.', () => deleteMemberDocument(token, memberId, type)) },
                      'Remove',
                    )}
                </div>
              )}

              {row?.status === 'SUBMITTED' && (canApprove || canReject) && (
                <div className="document-row__review">
                  {canApprove &&
                    createElement(
                      'md-filled-button',
                      { disabled: busy, onClick: () => run('Document approved.', () => reviewMemberDocument(token, memberId, type, { decision: 'APPROVED' })) },
                      'Approve',
                    )}
                  {canReject &&
                    createElement(
                      'md-outlined-button',
                      {
                        ref: (el: HTMLElement | null) => {
                          rejectTriggerRefs.current[type] = el;
                        },
                        disabled: busy,
                        'aria-expanded': rejecting === type ? 'true' : 'false',
                        onClick: () => {
                          setRejecting(type);
                          setRejectReason('');
                        },
                      },
                      'Reject',
                    )}
                </div>
              )}

              {rejecting === type && (
                <div className="document-row__reject" onKeyDown={onRejectKeyDown(type)}>
                  {createElement('md-outlined-text-field', {
                    ref: (el: HTMLElement | null) => {
                      rejectFieldRef.current = el;
                    },
                    label: REJECT_LABEL,
                    type: 'textarea',
                    rows: 3,
                    required: true,
                    maxlength: REASON_MAX,
                    value: rejectReason,
                    onInput: (e: { currentTarget: { value: string } }) => setRejectReason(e.currentTarget.value),
                  })}
                  {createElement(
                    'md-filled-button',
                    {
                      disabled: busy || !reasonValid,
                      onClick: () =>
                        run('Document rejected.', async () => {
                          await reviewMemberDocument(token, memberId, type, { decision: 'REJECTED', reason: reasonText });
                          setRejecting(null);
                          setRejectReason('');
                        }),
                    },
                    'Confirm reject',
                  )}
                  {createElement('md-text-button', { onClick: () => cancelReject(type) }, 'Cancel')}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default MemberDocumentsTab;
