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
