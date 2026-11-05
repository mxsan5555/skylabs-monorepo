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
  /** Heading level: `h2` (default) or `h3` under a section heading (dashboard recent orders). */
  as?: 'h2' | 'h3';
  /** Short line beside the heading (item count, date and a status badge). */
  meta?: ReactNode;
  /** Content between the heading and the rows (the order's lines). */
  children?: ReactNode;
  /** Lines above the total (subtotal, discount). */
  rows?: SummaryRow[];
  total: SummaryRow;
  /** Small print under the total. */
  note?: string;
  /** Full-width buttons, the main action first. */
  actions?: ReactNode;
  /** Actions in one end-aligned row instead of full width (an order in a list). */
  inlineActions?: boolean;
}

/**
 * Totals panel beside a list (cart): surface-container (the 30), rows and the total as a
 * description list, the total in primary (the 10, with the actions), a note and the actions.
 */
export function SummaryPanel({ id, heading, as: Heading = 'h2', meta, children, rows = [], total, note, actions, inlineActions = false }: SummaryPanelProps) {
  return (
    <section className="summary-panel" aria-labelledby={id}>
      <div className="summary-panel__head">
        <Heading id={id} className="summary-panel__heading title-large">
          {heading}
        </Heading>
        {meta && <div className="summary-panel__meta body-medium">{meta}</div>}
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
      {actions && <div className={inlineActions ? 'summary-panel__actions summary-panel__actions--inline' : 'summary-panel__actions'}>{actions}</div>}
    </section>
  );
}
