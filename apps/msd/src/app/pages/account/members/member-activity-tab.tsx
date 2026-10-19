import { useEffect, useState } from 'react';
import { getMemberActivity, type ActivityItem } from '../../../../api/rbac/members';
import { ApiRequestError } from '../../../../api/rbac/client';
import { ACTIVITY_DETAIL_LABEL, readableActivitySummary } from './member-status';

export interface MemberActivityTabProps {
  token: string | null;
  memberId: string;
  /** Bump after a status or document change to reload the list. */
  refreshKey: number;
}

/** Status changes, document events, reminders and the review flag, newest first (the API orders them). */
export function MemberActivityTab({ token, memberId, refreshKey }: MemberActivityTabProps) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getMemberActivity(token, memberId)
      .then(({ data }) => {
        if (!live) return;
        setItems(data);
        setError('');
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof ApiRequestError ? err.message : 'Could not load activity.');
      });
    return () => {
      live = false;
    };
  }, [token, memberId, refreshKey]);

  if (error) {
    return (
      <p className="error-state" role="alert">
        {error}
      </p>
    );
  }
  if (!items) return <p className="loading-state">Loading activity…</p>;
  if (items.length === 0) return <p className="empty-state">No activity yet.</p>;

  return (
    <ol className="activity-list" aria-label="Activity">
      {items.map((item, index) => (
        <li key={`${item.at}-${index}`} className="activity-list__item">
          <p>{readableActivitySummary(item.summary)}</p>
          {item.detail && <p className="field-hint">{`${ACTIVITY_DETAIL_LABEL[item.kind]}: ${item.detail}`}</p>}
          <p className="field-hint">
            <time dateTime={item.at}>{new Date(item.at).toLocaleString('en-GB')}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}

export default MemberActivityTab;
