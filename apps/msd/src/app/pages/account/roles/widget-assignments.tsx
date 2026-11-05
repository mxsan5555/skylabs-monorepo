import type { DashboardWidgetRecord } from '../../../../api/rbac/roles';

interface WidgetAssignmentsProps {
  catalog: DashboardWidgetRecord[];
  selected: ReadonlyMap<string, number>;
  onToggle: (widgetId: string) => void;
  onOrderChange: (widgetId: string, order: number) => void;
  disabled?: boolean;
}

/** Dashboard widgets a role's members see on `/dashboard`, with a display order. */
export function WidgetAssignments({ catalog, selected, onToggle, onOrderChange, disabled }: WidgetAssignmentsProps) {
  if (catalog.length === 0) {
    return <p className="empty-state">No dashboard widgets have been created yet.</p>;
  }

  return (
    <ul className="entity-list">
      {catalog.map((widget) => {
        const order = selected.get(widget.id);
        const isChecked = order !== undefined;
        return (
          <li key={widget.id} className="widget-assign-row">
            <label className="widget-assign-row__label">
              <input
                type="checkbox"
                checked={isChecked}
                disabled={disabled}
                onChange={() => onToggle(widget.id)}
              />
              {widget.title}
            </label>
            {isChecked && (
              <label className="widget-assign-row__order">
                Order
                <input
                  type="number"
                  min={0}
                  value={order}
                  disabled={disabled}
                  onChange={(e) => onOrderChange(widget.id, Number(e.target.value) || 0)}
                />
              </label>
            )}
          </li>
        );
      })}
    </ul>
  );
}
