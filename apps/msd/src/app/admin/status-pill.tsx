const POSITIVE = new Set(['LIVE', 'VERIFIED', 'CONFIRMED', 'COMPLETED', 'CAPTURED', 'ACTIVE']);
const WARNING = new Set(['DRAFT', 'PAUSED', 'PENDING_PAYMENT', 'PENDING', 'CREATED']);
const NEGATIVE = new Set(['SUSPENDED', 'ARCHIVED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REJECTED', 'SOLD_OUT']);

export function StatusPill({ status }: { status: string }) {
  const tone = POSITIVE.has(status) ? 'positive' : NEGATIVE.has(status) ? 'negative' : WARNING.has(status) ? 'warning' : '';
  return (
    <span className={`status-pill${tone ? ` status-pill--${tone}` : ''}`}>
      {status.toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}
