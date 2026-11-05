import { SkyDataTable } from '@skylabs-monorepo/shared-ui';
import { css } from 'lit';

/** Keep the shared table's search, sorting, pagination and column controls. */
export class DispatchTable extends SkyDataTable {
  static override styles = css`
    ${SkyDataTable.styles}
    td { white-space: pre-line; font-size: 14px; line-height: 1.6; vertical-align: top; }
    td[data-label="Pickup → Drop"] { min-width: 190px; max-width: 320px; overflow-wrap: anywhere; }
    td[data-label="Booking / Customer"] { font-weight: 500; }
    md-icon-button[hidden] { display: none; }
  `;

  protected override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    const rows = JSON.parse(this.rows || '[]') as { driverId?: string; assignable?: boolean }[];
    this.shadowRoot?.querySelectorAll('tbody tr').forEach((tr, index) => {
      const row = rows[index];
      tr.querySelectorAll<HTMLElement>('md-icon-button').forEach(button => {
        const action = button.getAttribute('title');
        if (action === 'Assign' || action === 'Reassign') {
          button.hidden = !row?.assignable || (action === 'Reassign' ? !row.driverId : !!row.driverId);
        }
      });
    });
  }
}

if (!customElements.get('md-dispatch-table')) customElements.define('md-dispatch-table', DispatchTable);
