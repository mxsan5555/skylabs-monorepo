import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-data-table.js';
import { SkyDataTable } from './sky-data-table.js';

installMaterialJsdomPolyfills();

const COLS = JSON.stringify([
  { key: 'name', label: 'Name', sortable: true },
  { key: 'status', label: 'Status', type: 'status', statusMap: { active: 'success', inactive: 'error' } },
]);
const ROWS = JSON.stringify([
  { name: 'Thai Bliss', status: 'active' },
  { name: 'Deep Tissue', status: 'inactive' },
]);

function createElement(): SkyDataTable {
  const el = document.createElement('sky-data-table') as SkyDataTable;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-data-table', () => {
  describe('renders', () => {
    it('renders with default props', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.page).toBe(1);
      expect(el.pageSize).toBe(10);
      expect(el.loading).toBe(false);
      expect(el.searchable).toBe(false);
      expect(el.selectable).toBe(false);
      expect(el.exportable).toBe(false);
      expect(el.total).toBe(0);
    });

    it('renders a table element in shadow root', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const table = el.shadowRoot?.querySelector('table');
      expect(table).toBeTruthy();
    });

    it('renders column headers from columns prop', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const ths = el.shadowRoot?.querySelectorAll('thead th');
      // Name + Status
      const labels = Array.from(ths ?? []).map((th) => th.textContent?.trim());
      expect(labels.some((l) => l?.includes('Name'))).toBe(true);
      expect(labels.some((l) => l?.includes('Status'))).toBe(true);
    });

    it('renders data rows', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const rows = el.shadowRoot?.querySelectorAll('tbody tr');
      expect(rows?.length).toBeGreaterThanOrEqual(2);
    });

    it('renders caption when caption prop is set', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      el.caption = 'Deals';
      await el.updateComplete;
      const caption = el.shadowRoot?.querySelector('caption');
      expect(caption?.textContent?.trim()).toBe('Deals');
    });

    it('renders empty state when rows is empty', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = '[]';
      el.total = 0;
      await el.updateComplete;
      const emptyDiv = el.shadowRoot?.querySelector('.empty');
      expect(emptyDiv).toBeTruthy();
    });
  });

  describe('status chip', () => {
    it('renders a chip element for status columns', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const chip = el.shadowRoot?.querySelector('sky-badge');
      expect(chip).toBeTruthy();
    });
  });

  describe('search', () => {
    it('renders search box when searchable is true', async () => {
      const el = createElement();
      el.searchable = true;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const searchField = el.shadowRoot?.querySelector('md-outlined-text-field');
      expect(searchField).toBeTruthy();
    });

    it('does not render search box when searchable is false', async () => {
      const el = createElement();
      el.searchable = false;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const searchField = el.shadowRoot?.querySelector('md-outlined-text-field');
      expect(searchField).toBeNull();
    });

    it('search input has label from searchPlaceholder', async () => {
      const el = createElement();
      el.searchable = true;
      el.searchPlaceholder = 'Find deal';
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const field = el.shadowRoot?.querySelector('md-outlined-text-field');
      expect(field?.getAttribute('label')).toBe('Find deal');
    });

    it('fires sky-dt-params-change when search input changes', async () => {
      const el = createElement();
      el.searchable = true;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('sky-dt-params-change', (e) => events.push(e as CustomEvent));

      const field = el.shadowRoot?.querySelector('md-outlined-text-field') as HTMLElement & { value: string };
      field.value = 'Thai';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0].detail.search).toBe('Thai');
    });
  });

  describe('sort', () => {
    it('sortable column header has tabindex=0', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const sortableTh = el.shadowRoot?.querySelector('th.col-sort');
      expect(sortableTh?.getAttribute('tabindex')).toBe('0');
    });

    it('fires sky-dt-params-change on sort column click', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('sky-dt-params-change', (e) => events.push(e as CustomEvent));

      const sortableTh = el.shadowRoot?.querySelector('th.col-sort') as HTMLElement;
      sortableTh.click();
      await el.updateComplete;

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].detail.sortKey).toBe('name');
      expect(events[0].detail.sortDir).toBe('asc');
    });

    it('cycles sort direction asc → desc → none on repeated clicks', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('sky-dt-params-change', (e) => events.push(e as CustomEvent));

      const sortableTh = el.shadowRoot?.querySelector('th.col-sort') as HTMLElement;
      sortableTh.click();
      await el.updateComplete;
      sortableTh.click();
      await el.updateComplete;
      sortableTh.click();
      await el.updateComplete;

      expect(events[0].detail.sortDir).toBe('asc');
      expect(events[1].detail.sortDir).toBe('desc');
      expect(events[2].detail.sortDir).toBe('');
    });
  });

  describe('pagination', () => {
    it('renders previous/next nav buttons', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const navBtns = el.shadowRoot?.querySelectorAll('nav md-icon-button');
      expect(navBtns?.length).toBe(2);
    });

    it('previous button is disabled on page 1', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 50;
      el.page = 1;
      await el.updateComplete;
      const prev = el.shadowRoot?.querySelector('md-icon-button[aria-label="Previous page"]') as HTMLElement;
      expect(prev?.hasAttribute('disabled')).toBe(true);
    });

    it('renders rows-per-page selector', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const rppSelect = el.shadowRoot?.querySelector('md-outlined-select.rpp-select');
      expect(rppSelect).toBeTruthy();
    });

    it('pagination nav has aria-label', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const nav = el.shadowRoot?.querySelector('nav.pagination');
      expect(nav?.getAttribute('aria-label')).toBe('Table pagination');
    });
  });

  describe('loading state', () => {
    it('renders skeleton rows when loading is true', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = '[]';
      el.total = 0;
      el.loading = true;
      await el.updateComplete;
      const skelRows = el.shadowRoot?.querySelectorAll('tr.skel-row');
      expect((skelRows?.length ?? 0)).toBeGreaterThan(0);
    });

    it('table has aria-busy=true when loading', async () => {
      const el = createElement();
      el.loading = true;
      el.columns = COLS;
      el.rows = '[]';
      el.total = 0;
      await el.updateComplete;
      const table = el.shadowRoot?.querySelector('table');
      expect(table?.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('selectable', () => {
    it('renders select-all checkbox when selectable is true', async () => {
      const el = createElement();
      el.selectable = true;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const selectAll = el.shadowRoot?.querySelector('th.col-cb md-checkbox');
      expect(selectAll).toBeTruthy();
    });

    it('does not render checkbox column when selectable is false', async () => {
      const el = createElement();
      el.selectable = false;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const colCb = el.shadowRoot?.querySelector('th.col-cb');
      expect(colCb).toBeNull();
    });
  });

  describe('exportable', () => {
    it('renders export button when exportable is true', async () => {
      const el = createElement();
      el.exportable = true;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const exportBtn = el.shadowRoot?.querySelector('md-icon-button[aria-label="Export as PDF"]');
      expect(exportBtn).toBeTruthy();
    });

    it('does not render export button when exportable is false', async () => {
      const el = createElement();
      el.exportable = false;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const exportBtn = el.shadowRoot?.querySelector('md-icon-button[aria-label="Export as PDF"]');
      expect(exportBtn).toBeNull();
    });
  });

  describe('accessibility', () => {
    it('table has aria-rowcount equal to total', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 42;
      await el.updateComplete;
      const table = el.shadowRoot?.querySelector('table');
      expect(table?.getAttribute('aria-rowcount')).toBe('42');
    });

    it('select-all checkbox has aria-label', async () => {
      const el = createElement();
      el.selectable = true;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const cb = el.shadowRoot?.querySelector('th.col-cb md-checkbox');
      expect(cb?.getAttribute('aria-label')).toBe('Select all rows');
    });

    it('toolbar has role=toolbar with aria-label', async () => {
      const el = createElement();
      el.searchable = true;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const toolbar = el.shadowRoot?.querySelector('[role="toolbar"]');
      expect(toolbar?.getAttribute('aria-label')).toBe('Table controls');
    });

    it('detail drawer has role=dialog and aria-modal=true', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const overlay = el.shadowRoot?.querySelector('.overlay');
      expect(overlay?.getAttribute('role')).toBe('dialog');
      expect(overlay?.getAttribute('aria-modal')).toBe('true');
    });
  });

  describe('detail drawer', () => {
    it('detail overlay is hidden by default', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;
      const overlay = el.shadowRoot?.querySelector('.overlay') as HTMLElement;
      expect(overlay?.hidden).toBe(true);
    });

    it('traps Tab/Shift+Tab inside the open drawer so focus cannot escape to the page behind it', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      el.actions = JSON.stringify([{ icon: 'visibility', label: 'View', event: '__view_detail__' }]);
      await el.updateComplete;

      (el.shadowRoot?.querySelector('td.col-act md-icon-button') as HTMLElement).click();
      await el.updateComplete;

      const closeBtn = el.shadowRoot?.querySelector('.close-btn-el') as HTMLElement;
      expect(closeBtn).toBeTruthy();

      // jsdom doesn't implement focus delegation for Material's custom elements, so
      // shadowRoot.activeElement never reflects a real .focus() call on an md-icon-button —
      // stub it to "the close button has focus" (the real-browser state right after open,
      // since it's the drawer's only focusable element) to exercise the trap's own branch logic.
      Object.defineProperty(el.shadowRoot, 'activeElement', { configurable: true, get: () => closeBtn });
      const focusSpy = vi.spyOn(closeBtn, 'focus');

      // The close button is the only focusable element in the drawer today, so both Tab and
      // Shift+Tab must keep the trap closed on it rather than letting focus move elsewhere.
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(focusSpy).toHaveBeenCalled();

      focusSpy.mockClear();
      const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(shiftTab);
      expect(shiftTab.defaultPrevented).toBe(true);
      expect(focusSpy).toHaveBeenCalled();
    });

    it('does not intercept Tab when the drawer is closed', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;

      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(false);
    });
  });

  describe('column selector', () => {
    it('fires sky-dt-column-error (never a blocking alert()) when hiding the last visible column, and reverts the checkbox', async () => {
      const el = createElement();
      el.searchable = true; // the toolbar — and the column-selector button inside it — only renders when non-empty
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;

      (el.shadowRoot?.querySelector('.col-selector-wrap md-icon-button') as HTMLElement).click();
      await el.updateComplete;

      const checkboxes = Array.from(
        el.shadowRoot?.querySelectorAll('.col-selector-menu md-checkbox') ?? [],
      ) as (HTMLElement & { checked: boolean })[];
      expect(checkboxes.length).toBe(2);

      const events: CustomEvent[] = [];
      el.addEventListener('sky-dt-column-error', (e) => events.push(e as CustomEvent));

      // Hiding the first column still leaves one visible — should succeed quietly.
      checkboxes[0].checked = false;
      checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
      await el.updateComplete;
      expect(events.length).toBe(0);

      // Hiding the only remaining visible column is rejected.
      checkboxes[1].checked = false;
      checkboxes[1].dispatchEvent(new Event('change', { bubbles: true }));
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0].detail).toEqual({ message: 'At least one column must remain visible.' });
      expect(checkboxes[1].checked).toBe(true);

      // Every consumer gets feedback even if nothing listens for the event — the menu shows
      // its own announced message.
      const errorEl = el.shadowRoot?.querySelector('.col-selector-menu .col-error');
      expect(errorEl?.getAttribute('role')).toBe('alert');
      expect(errorEl?.textContent).toBe('At least one column must remain visible.');
    });

    it('clears the inline error once a column is successfully toggled', async () => {
      const el = createElement();
      el.searchable = true;
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      await el.updateComplete;

      (el.shadowRoot?.querySelector('.col-selector-wrap md-icon-button') as HTMLElement).click();
      await el.updateComplete;
      const checkboxes = Array.from(
        el.shadowRoot?.querySelectorAll('.col-selector-menu md-checkbox') ?? [],
      ) as (HTMLElement & { checked: boolean })[];

      checkboxes[0].checked = false;
      checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
      checkboxes[1].checked = false;
      checkboxes[1].dispatchEvent(new Event('change', { bubbles: true }));
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.col-error')).toBeTruthy();

      // Re-showing the first column is a successful toggle — the error should clear.
      checkboxes[0].checked = true;
      checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.col-error')).toBeNull();
    });
  });

  describe('actions', () => {
    it('renders action column header when actions are defined', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      el.actions = JSON.stringify([{ icon: 'edit', label: 'Edit', event: 'edit' }]);
      await el.updateComplete;
      const actHeader = el.shadowRoot?.querySelector('th.col-act');
      expect(actHeader).toBeTruthy();
    });

    it('fires sky-dt-row-action event on action button click', async () => {
      const el = createElement();
      el.columns = COLS;
      el.rows = ROWS;
      el.total = 2;
      el.actions = JSON.stringify([{ icon: 'edit', label: 'Edit', event: 'edit' }]);
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('sky-dt-row-action', (e) => events.push(e as CustomEvent));

      const actBtn = el.shadowRoot?.querySelector('td.col-act md-icon-button') as HTMLElement;
      actBtn?.click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0].detail.action).toBe('edit');
    });
  });
});
