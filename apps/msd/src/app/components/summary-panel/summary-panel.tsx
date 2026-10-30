import type { ReactNode } from 'react';
import './summary-panel.css';

export interface SummaryRow {
  label: string;
  value: string;
}

export interface SummaryPanelProps {
  /** Id of the h2, which names the region. */
  id: string;
  heading: string;
  /** Short line beside the heading (item count). */
  meta?: string;
  /** Content between the heading and the rows (the order's lines). */
  children?: ReactNode;
  /** Lines above the total (subtotal, discount). */
  rows?: SummaryRow[];
  total: SummaryRow;
  /** Small print under the total. */
  note?: string;
  /** Full-width buttons, the main action first. */
  actions?: ReactNode;
}

/**
 * Totals panel beside a list (cart): surface-container (the 30), rows and the total as a
 * description list, the total in primary (the 10, with the actions), a note and the actions.
 */
export function SummaryPanel({ id, heading, meta, children, rows = [], total, note, actions }: SummaryPanelProps) {
  return (
    <section className="summary-panel" aria-labelledby={id}>
      <div className="summary-panel__head">
        <h2 id={id} className="summary-panel__heading title-large">
          {heading}
        </h2>
        {meta && <p className="summary-panel__meta body-medium">{meta}</p>}
      </div>
      {children}
      <dl className="summary-panel__rows">
        {rows.map((row) => (
          <div key={row.label} className="summary-panel__row body-medium">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        <div className="summary-panel__row summary-panel__total">
          <dt className="title-medium">{total.label}</dt>
          <dd className="headline-small">{total.value}</dd>
        </div>
      </dl>
      {note && <p className="summary-panel__note body-small">{note}</p>}
      {actions && <div className="summary-panel__actions">{actions}</div>}
    </section>
  );
}
