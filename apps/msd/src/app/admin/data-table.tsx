import type { ReactNode } from 'react';
import { LinearProgress } from '@skylabs-monorepo/shared-ui/react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  actions?: (row: T) => ReactNode;
}

/** Plain `<table>` styled via admin-console.css — Material Web has no data-table
 *  component, and a bespoke one would be pure overhead for ~8 CRUD lists. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyMessage = 'Nothing here yet.',
  actions,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="data-table-wrap">
        <LinearProgress indeterminate aria-label="Loading" />
        <p className="data-table__loading">Loading…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="data-table-wrap">
        <p className="data-table__empty">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.header}
              </th>
            ))}
            {actions && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key}>{c.render(row)}</td>
              ))}
              {actions && <td className="data-table__actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
