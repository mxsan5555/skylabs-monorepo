import { LitElement, html, css, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { focusRing, hostBase, srOnly, typescale } from '../shared-styles.js';
// Material Web — side-effect imports to register each custom element
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/checkbox/checkbox.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
// In-house — status chips use sky-badge
import '../sky-badge/sky-badge.js';

// ── Public types ────────────────────────────────────────────────────────────

export interface SkyDataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  /** 'status' renders a sky-badge; 'image' renders a round img; 'text' | 'number' | 'date' render as-is. */
  type?: 'text' | 'number' | 'date' | 'status' | 'image';
  /** Backwards compatibility for status columns */
  status?: boolean;
  /** Maps status string → badge variant. Used when type === 'status'. */
  statusMap?: Record<string, 'success' | 'warning' | 'error' | 'info'>;
  /** Starts the column as hidden in the selector */
  hidden?: boolean;
}

export interface SkyDataTableAction {
  icon: string;
  label: string;
  /** Custom event name fired on click, or '__view_detail__' to open the detail drawer. */
  event: string;
  /** 'danger' colours the button red using error role tokens. */
  variant?: 'default' | 'danger';
}

export interface SkyDataTableParamsDetail {
  page: number;
  pageSize: number;
  sortKey: string;
  sortDir: 'asc' | 'desc' | '';
  search: string;
  filter: string;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * <sky-data-table> — enterprise data table with lazy loading, search, filter,
 * sort, pagination, PDF export, row selection, action buttons, and a detail
 * drawer. Presenter-only: all data fetching is handled by the consumer via the
 * `sky-dt-params-change` event.
 *
 * Internal UI uses Material Web components (md-outlined-text-field,
 * md-outlined-select, md-icon-button, md-checkbox, md-linear-progress) and
 * the in-house sky-badge for status chips. No custom button or input classes.
 *
 * @prop {string}  caption           — Table title shown as <caption> and in PDF export.
 * @prop {string}  columns           — JSON array of SkyDataTableColumn.
 * @prop {string}  rows              — JSON array of row objects.
 * @prop {number}  total             — Total record count (for pagination).
 * @prop {number}  page              — Current page (1-based).
 * @prop {number}  page-size         — Rows per page (default 10).
 * @prop {boolean} loading           — Shows skeleton rows + progress bar when true.
 * @prop {boolean} searchable        — Renders the search text field in the toolbar.
 * @prop {string}  search-placeholder — Label / placeholder for the search field.
 * @prop {string}  filter-label      — Label for the filter select dropdown.
 * @prop {string}  filter-options    — JSON array of {label, value} objects for the filter.
 * @prop {boolean} selectable        — Adds a checkbox column for row selection.
 * @prop {string}  actions           — JSON array of SkyDataTableAction.
 * @prop {boolean} exportable        — Shows the PDF export icon button in the toolbar.
 *
 * @fires sky-dt-params-change — page/sort/search/filter changed; re-fetch data
 * @fires sky-dt-row-action    — action button clicked; detail: { action, row, rowIndex }
 * @fires sky-dt-row-select    — selection changed; detail: { selected: row[] }
 * @fires sky-dt-export-pdf    — PDF export triggered
 *
 * @example
 * <sky-data-table
 *   caption="Deals"
 *   columns='[{"key":"name","label":"Name","sortable":true}]'
 *   rows='[{"name":"Thai Bliss"}]'
 *   total="100"
 *   searchable
 *   exportable
 *   selectable
 *   filter-label="Status"
 *   filter-options='[{"label":"Active","value":"active"},{"label":"Closed","value":"closed"}]'
 *   actions='[{"icon":"visibility","label":"View","event":"__view_detail__"},{"icon":"edit","label":"Edit","event":"edit"},{"icon":"delete","label":"Delete","event":"delete","variant":"danger"}]'
 * ></sky-data-table>
 */
export class SkyDataTable extends LitElement {
  static override properties = {
    columns:           { type: String },
    rows:              { type: String },
    total:             { type: Number },
    page:              { type: Number, reflect: true },
    pageSize:          { type: Number, attribute: 'page-size', reflect: true },
    loading:           { type: Boolean, reflect: true },
    searchable:        { type: Boolean },
    searchPlaceholder: { type: String, attribute: 'search-placeholder' },
    filterLabel:       { type: String, attribute: 'filter-label' },
    filterOptions:     { type: String, attribute: 'filter-options' },
    selectable:        { type: Boolean },
    actions:           { type: String },
    exportable:        { type: Boolean },
    caption:           { type: String },
    _search:           { state: true },
    _filter:           { state: true },
    _sortKey:          { state: true },
    _sortDir:          { state: true },
    _selected:         { state: true },
    _detailRow:        { state: true },
    _detailOpen:       { state: true },
    _hiddenCols:       { state: true },
    _showColSelector:  { state: true },
  };

  declare columns: string;
  declare rows: string;
  declare total: number;
  declare page: number;
  declare pageSize: number;
  declare loading: boolean;
  declare searchable: boolean;
  declare searchPlaceholder: string;
  declare filterLabel: string;
  declare filterOptions: string;
  declare selectable: boolean;
  declare actions: string;
  declare exportable: boolean;
  declare caption: string;

  private declare _search: string;
  private declare _filter: string;
  private declare _sortKey: string;
  private declare _sortDir: 'asc' | 'desc' | '';
  private declare _selected: Set<number>;
  private declare _detailRow: Record<string, unknown> | null;
  private declare _detailOpen: boolean;
  private declare _lastFocus: Element | null;
  private declare _hiddenCols: Set<string>;
  private declare _showColSelector: boolean;

  private readonly _pageSizeOptions = [10, 25, 50, 100];

  /** Maps internal status variant → sky-badge variant prop. */
  private readonly _statusVariant: Record<string, 'primary' | 'secondary' | 'tertiary' | 'error'> = {
    success: 'tertiary',
    warning: 'secondary',
    error:   'error',
    info:    'primary',
  };

  constructor() {
    super();
    this.columns           = '[]';
    this.rows              = '[]';
    this.total             = 0;
    this.page              = 1;
    this.pageSize          = 10;
    this.loading           = false;
    this.searchable        = false;
    this.searchPlaceholder = 'Search…';
    this.filterLabel       = 'Filter';
    this.filterOptions     = '[]';
    this.selectable        = false;
    this.actions           = '[]';
    this.exportable        = false;
    this.caption           = '';
    this._search           = '';
    this._filter           = '';
    this._sortKey          = '';
    this._sortDir          = '';
    this._selected         = new Set();
    this._detailRow        = null;
    this._detailOpen       = false;
    this._hiddenCols       = new Set();
    this._showColSelector  = false;
    this._lastFocus        = null;
  }

  // ── Parsed getters ────────────────────────────────────────────────────────

  private get _allCols(): SkyDataTableColumn[] {
    try { return JSON.parse(this.columns) || []; } catch { return []; }
  }

  private get _cols(): SkyDataTableColumn[] {
    return this._allCols.filter(col => !this._hiddenCols.has(col.key));
  }
  private get _rowData(): Record<string, unknown>[] {
    try { return JSON.parse(this.rows) || []; } catch { return []; }
  }
  private get _filterOpts(): { label: string; value: string }[] {
    try { return JSON.parse(this.filterOptions) || []; } catch { return []; }
  }
  private get _actionDefs(): SkyDataTableAction[] {
    try { return JSON.parse(this.actions) || []; } catch { return []; }
  }
  private get _totalPages() {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }
  private get _allSelected() {
    const rows = this._rowData;
    return rows.length > 0 && this._selected.size === rows.length;
  }
  private get _indeterminate() {
    return this._selected.size > 0 && this._selected.size < this._rowData.length;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  private _emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private _emitParams() {
    const detail: SkyDataTableParamsDetail = {
      page:     this.page,
      pageSize: this.pageSize,
      sortKey:  this._sortKey,
      sortDir:  this._sortDir,
      search:   this._search,
      filter:   this._filter,
    };
    this._emit('sky-dt-params-change', detail);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private _onSearch(e: Event) {
    this._search = (e.target as HTMLElement & { value: string }).value;
    this.page = 1;
    this._selected = new Set();
    this._emitParams();
  }

  private _onFilter(e: Event) {
    this._filter = (e.target as HTMLElement & { value: string }).value;
    this.page = 1;
    this._selected = new Set();
    this._emitParams();
  }

  private _onSort(key: string) {
    if (this._sortKey === key) {
      if (this._sortDir === 'asc')       { this._sortDir = 'desc'; }
      else if (this._sortDir === 'desc') { this._sortDir = ''; this._sortKey = ''; }
      else                               { this._sortDir = 'asc'; }
    } else {
      this._sortKey = key;
      this._sortDir = 'asc';
    }
    this.page = 1;
    this._emitParams();
  }

  private _onSelectAll() {
    this._selected = this._allSelected
      ? new Set()
      : new Set(this._rowData.map((_, i) => i));
    this._emit('sky-dt-row-select', { selected: [...this._selected].map(i => this._rowData[i]) });
    this.requestUpdate();
  }

  private _onSelectRow(idx: number) {
    const next = new Set(this._selected);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    this._selected = next;
    this._emit('sky-dt-row-select', { selected: [...this._selected].map(i => this._rowData[i]) });
  }

  private _onPageSize(e: Event) {
    this.pageSize = Number((e.target as HTMLElement & { value: string }).value);
    this.page = 1;
    this._selected = new Set();
    this._emitParams();
  }

  private _onPage(p: number) {
    if (p < 1 || p > this._totalPages || p === this.page) return;
    this.page = p;
    this._selected = new Set();
    this._emitParams();
  }

  private _onAction(action: SkyDataTableAction, row: Record<string, unknown>, idx: number) {
    this._emit('sky-dt-row-action', { action: action.event, row, rowIndex: idx });
  }

  private _onViewDetail(row: Record<string, unknown>) {
    this._lastFocus = this.shadowRoot?.activeElement ?? document.activeElement;
    this._detailRow = row;
    this._detailOpen = true;
  }

  private _closeDetail() {
    this._detailOpen = false;
    (this._lastFocus as HTMLElement | null)?.focus();
  }

  private _toggleColSelector(e: Event) {
    e.stopPropagation();
    this._showColSelector = !this._showColSelector;
  }

  private _onColToggle(key: string, e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    const next = new Set(this._hiddenCols);
    if (checked) {
      next.delete(key);
    } else {
      if (next.size >= this._allCols.length - 1 && !this._hiddenCols.has(key)) {
        alert("At least one column must remain visible!");
        (e.target as HTMLInputElement).checked = true;
        return;
      }
      next.add(key);
    }
    this._hiddenCols = next;
  }

  private readonly _onWindowClick = (e: MouseEvent) => {
    if (!this._showColSelector) return;
    const path = e.composedPath();
    const isInside = path.some(el => el instanceof HTMLElement && (el.classList.contains('col-selector-wrap') || el.classList.contains('col-selector-menu')));
    if (!isInside) {
      this._showColSelector = false;
    }
  };

  private readonly _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this._detailOpen) this._closeDetail();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('click', this._onWindowClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('click', this._onWindowClick);
  }

  override willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('columns')) {
      const all = this._allCols;
      const initialHidden = new Set(this._hiddenCols);
      let changed = false;
      all.forEach(col => {
        if (col.hidden && !this._hiddenCols.has(col.key)) {
          initialHidden.add(col.key);
          changed = true;
        }
      });
      if (changed) {
        this._hiddenCols = initialHidden;
      }
    }
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has('_detailOpen') && this._detailOpen) {
      requestAnimationFrame(() => {
        (this.shadowRoot?.querySelector('.close-btn-el') as HTMLElement | null)?.focus();
      });
    }
  }

  private _exportPdf() {
    const cols = this._cols;
    const rows = this._rowData;
    const headers = cols.map(c => `<th>${c.label}</th>`).join('');
    const body = rows.map(r =>
      `<tr>${cols.map(c => `<td>${String(r[c.key] ?? '')}</td>`).join('')}</tr>`
    ).join('');
    // Print popup uses hex values intentionally — CSS custom properties
    // cannot be read across window.open() popup boundaries.
    const markup = `<!DOCTYPE html><html><head><title>${this.caption || 'Export'}</title>
<style>
  body{font-family:sans-serif;font-size:12px;margin:20px}
  h2{margin:0 0 12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
  th{background:#f5f5f5;font-weight:600}
  tr:nth-child(even){background:#fafafa}
</style></head><body>
${this.caption ? `<h2>${this.caption}</h2>` : ''}
<table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(markup); win.document.close(); }
    this._emit('sky-dt-export-pdf', { total: rows.length });
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  private _sortIcon(key: string) {
    if (this._sortKey !== key) {
      return html`<md-icon class="sort-icon sort-icon--idle" aria-hidden="true">unfold_more</md-icon>`;
    }
    return this._sortDir === 'asc'
      ? html`<md-icon class="sort-icon sort-icon--on" aria-hidden="true">arrow_upward</md-icon>`
      : html`<md-icon class="sort-icon sort-icon--on" aria-hidden="true">arrow_downward</md-icon>`;
  }

  private _cellContent(value: unknown, col: SkyDataTableColumn) {
    if (col.status || col.type === 'status') {
      const str = String(value ?? '');
      const statusVariant = col.statusMap?.[str] ?? (['success', 'warning', 'error', 'info'].includes(str) ? str : 'info');
      const badgeVariant  = this._statusVariant[statusVariant] ?? 'primary';
      return html`<sky-badge variant=${badgeVariant} size="small">${str}</sky-badge>`;
    }
    if (col.type === 'image') {
      const src = String(value ?? '');
      if (src && src.startsWith('http')) {
        return html`<img class="cell-avatar" src=${src} alt=${col.label} loading="lazy" decoding="async" />`;
      }
      return html`<md-icon class="cell-avatar cell-avatar--empty" aria-hidden="true">account_circle</md-icon>`;
    }
    return html`${value ?? ''}`;
  }

  private _skeletonRows() {
    const cols       = this._cols;
    const actionDefs = this._actionDefs;
    return Array.from({ length: this.pageSize }, () => html`
      <tr class="skel-row" aria-hidden="true">
        ${this.selectable ? html`<td class="col-cb" data-label=""><div class="skel skel--xs"></div></td>` : nothing}
        ${cols.map(col => html`<td data-label=${col.label}><div class="skel"></div></td>`)}
        ${actionDefs.length ? html`<td class="col-act" data-label=""><div class="skel skel--sm"></div></td>` : nothing}
      </tr>
    `);
  }

  private _pageButtons() {
    const total = this._totalPages;
    const cur   = this.page;
    const pages: (number | '...')[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (cur > 3) pages.push('...');
      const lo = Math.max(2, cur - 1);
      const hi = Math.min(total - 1, cur + 1);
      for (let i = lo; i <= hi; i++) pages.push(i);
      if (cur < total - 2) pages.push('...');
      pages.push(total);
    }

    return pages.map(p =>
      p === '...'
        ? html`<span class="ellipsis" aria-hidden="true">…</span>`
        : html`<button
            type="button"
            class="pg-btn ${p === cur ? 'pg-btn--active' : ''}"
            aria-label="Page ${p}"
            aria-current=${p === cur ? 'page' : nothing}
            @click=${() => this._onPage(p as number)}
          >${p}</button>`
    );
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  static override styles = css`
    ${hostBase}
    ${srOnly}
    ${typescale}

    /* Consumers can override the overlay z-index when stacking contexts conflict. */
    :host {
      --_overlay-z: 200;
      --_row-hover: color-mix(
        in srgb,
        var(--md-sys-color-primary) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
        transparent
      );
      --_zebra: color-mix(in srgb, var(--md-sys-color-surface-variant) 20%, transparent);
    }

    /* ── Container: full-bleed on mobile, rounded from 600px ─────────────── */
    .wrap {
      border: 1px solid var(--md-sys-color-outline-variant);
      background-color: var(--md-sys-color-surface);
      overflow: hidden;
    }

    /* ── Toolbar ─────────────────────────────────────────────────────────── */
    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
      border-block-end: 1px solid var(--md-sys-color-outline-variant);
    }
    .toolbar__spacer {
      flex: 1;
      min-inline-size: 8px;
    }
    /* Compact M3 outlined fields for the toolbar. */
    .search-field,
    .filter-select,
    .rpp-select {
      --md-outlined-field-container-height: 40px;
      --md-outlined-field-top-space: 8px;
      --md-outlined-field-bottom-space: 8px;
    }
    .search-field {
      inline-size: 100%;
      min-inline-size: 0;
    }
    .filter-select {
      min-inline-size: 150px;
    }
    .rpp-select {
      min-inline-size: 90px;
    }
    .act--danger {
      --md-icon-button-icon-color: var(--md-sys-color-error);
      --md-icon-button-hover-icon-color: var(--md-sys-color-error);
      --md-icon-button-hover-state-layer-color: var(--md-sys-color-error);
      --md-icon-button-pressed-state-layer-color: var(--md-sys-color-error);
    }

    /* ── Column selector ─────────────────────────────────────────────────── */
    .col-selector-wrap {
      position: relative;
    }
    .col-selector-menu {
      position: absolute;
      inset-block-start: 100%;
      inset-inline-end: 0;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-inline-size: 180px;
      padding: 12px;
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: var(--md-sys-shape-corner-medium);
      background-color: var(--md-sys-color-surface-container-high);
      box-shadow: var(--sky-elevation-2);
      text-align: start;
    }
    .col-selector-menu__title {
      margin-block-end: 4px;
      color: var(--md-sys-color-on-surface-variant);
    }
    .col-option {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--md-sys-color-on-surface);
      cursor: pointer;
      user-select: none;
    }

    /* ── Progress bar ────────────────────────────────────────────────────── */
    .progress-rail {
      block-size: 3px;
      background-color: var(--md-sys-color-surface-container-low);
    }
    md-linear-progress {
      inline-size: 100%;
      --md-linear-progress-track-height: 3px;
    }

    /* ── Table: stacked cards on mobile ──────────────────────────────────── */
    caption {
      padding: 14px 16px 2px;
      text-align: start;
      caption-side: top;
      color: var(--md-sys-color-on-surface);
    }
    table,
    tbody {
      display: block;
      inline-size: 100%;
      border-collapse: collapse;
    }
    thead {
      display: none;
    }
    tbody tr {
      display: block;
      margin: 12px;
      padding: 12px;
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: var(--md-sys-shape-corner-medium);
      background-color: var(--md-sys-color-surface-container-low);
      transition: background-color var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-standard);
    }
    tbody tr:hover {
      background-color: color-mix(
        in srgb,
        var(--md-sys-color-primary) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
        var(--md-sys-color-surface-container-low)
      );
    }
    td {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-block-end: 1px solid var(--md-sys-color-outline-variant);
      color: var(--md-sys-color-on-surface);
    }
    td::before {
      content: attr(data-label);
      flex-shrink: 0;
      margin-inline-end: 12px;
      font-size: var(--md-sys-typescale-label-medium-size);
      font-weight: 600;
      color: var(--md-sys-color-on-surface-variant);
    }
    td.col-cb {
      border: none;
      padding: 0;
    }
    /* Align the checkbox square with the labels below (offsets its 15px touch padding). */
    td.col-cb md-checkbox {
      margin-inline-start: -15px;
    }
    tbody tr.row--selected {
      background-color: var(--md-sys-color-secondary-container);
      border-color: var(--md-sys-color-secondary);
    }
    tr.skel-row {
      background-color: transparent;
    }

    th {
      block-size: 52px;
      padding: 0 16px;
      text-align: start;
      white-space: nowrap;
      user-select: none;
      color: var(--md-sys-color-on-surface-variant);
      border-block-end: 1px solid var(--md-sys-color-outline-variant);
    }
    th.col-sort {
      cursor: pointer;
    }
    th.col-sort:hover {
      background-color: color-mix(
        in srgb,
        var(--md-sys-color-on-surface) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
        transparent
      );
    }
    th.col-sort:focus-visible {
      ${focusRing}
      outline-offset: -3px;
    }
    .th-inner {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .sort-icon {
      --md-icon-size: 16px;
    }
    .sort-icon--idle {
      color: var(--md-sys-color-outline);
    }
    .sort-icon--on {
      color: var(--md-sys-color-primary);
    }
    .cell-avatar {
      inline-size: 32px;
      block-size: 32px;
      vertical-align: middle;
      border-radius: var(--md-sys-shape-corner-full);
    }
    img.cell-avatar {
      object-fit: cover;
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    .cell-avatar--empty {
      --md-icon-size: 32px;
      color: var(--md-sys-color-outline);
    }
    .col-cb {
      inline-size: 52px;
      text-align: center;
    }
    .col-act {
      white-space: nowrap;
      text-align: end;
    }

    /* ── Tablet and up: real table ───────────────────────────────────────── */
    @media (min-width: 600px) {
      .wrap {
        border-radius: var(--md-sys-shape-corner-medium);
      }
      .toolbar {
        padding: 12px 16px;
      }
      .search-field {
        inline-size: auto;
        min-inline-size: 200px;
        max-inline-size: 320px;
      }
      .scroll {
        overflow-x: auto;
      }
      table {
        display: table;
      }
      thead {
        display: table-header-group;
        background-color: var(--md-sys-color-surface-variant);
      }
      tbody {
        display: table-row-group;
      }
      tbody tr {
        display: table-row;
        margin: 0;
        padding: 0;
        border: none;
        border-radius: 0;
        background-color: transparent;
      }
      tbody tr:nth-child(odd) {
        background-color: var(--_zebra);
      }
      tbody tr:hover {
        background-color: var(--_row-hover);
      }
      tbody tr.row--selected {
        background-color: var(--md-sys-color-secondary-container);
      }
      tr.skel-row {
        background-color: transparent;
      }
      td {
        display: table-cell;
        block-size: 52px;
        padding: 0 16px;
        vertical-align: middle;
      }
      tbody tr:last-child td {
        border-block-end: none;
      }
      td::before {
        display: none;
      }
      td.col-cb {
        padding: 0 8px;
        border-block-end: 1px solid var(--md-sys-color-outline-variant);
      }
      td.col-cb md-checkbox {
        margin-inline-start: 0;
      }
      .col-act {
        padding-inline-end: 8px;
      }
    }

    /* ── Skeleton shimmer (duration token is 0 under reduced motion) ─────── */
    @keyframes shimmer {
      from {
        background-position: -600px 0;
      }
      to {
        background-position: 600px 0;
      }
    }
    .skel {
      block-size: 14px;
      border-radius: var(--md-sys-shape-corner-extra-small);
      background: linear-gradient(
        90deg,
        var(--md-sys-color-surface-container) 25%,
        var(--md-sys-color-surface-container-high) 50%,
        var(--md-sys-color-surface-container) 75%
      );
      background-size: 1200px 14px;
      animation: shimmer var(--md-sys-motion-duration-extra-long2) ease-in-out infinite;
    }
    .skel--xs {
      inline-size: 20px;
      block-size: 20px;
      margin-inline: auto;
    }
    .skel--sm {
      inline-size: 80px;
      margin-inline-start: auto;
    }

    /* ── Empty state ─────────────────────────────────────────────────────── */
    .empty {
      padding: 56px 16px;
      text-align: center;
      color: var(--md-sys-color-on-surface-variant);
    }
    .empty md-icon {
      --md-icon-size: 48px;
      display: block;
      margin: 0 auto 12px;
      color: var(--md-sys-color-outline);
    }

    /* ── Footer / pagination: stacked on mobile, one row from 600px ─────── */
    .footer {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px;
      border-block-start: 1px solid var(--md-sys-color-outline-variant);
      color: var(--md-sys-color-on-surface-variant);
    }
    .footer__range {
      flex: 1;
      min-inline-size: 100px;
    }
    .footer__rpp {
      display: flex;
      align-items: center;
      gap: 6px;
      inline-size: 100%;
      white-space: nowrap;
    }
    .pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      inline-size: 100%;
    }
    .pg-btn {
      min-inline-size: 32px;
      block-size: 32px;
      padding: 0 6px;
      border: none;
      border-radius: var(--md-sys-shape-corner-small);
      background-color: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      cursor: pointer;
      transition: background-color var(--md-sys-motion-duration-short2) var(--md-sys-motion-easing-standard);
    }
    .pg-btn:hover {
      background-color: color-mix(
        in srgb,
        var(--md-sys-color-on-surface) calc(var(--md-sys-state-hover-state-layer-opacity) * 100%),
        transparent
      );
    }
    .pg-btn:focus-visible {
      ${focusRing}
    }
    .pg-btn--active,
    .pg-btn--active:hover {
      background-color: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 600;
    }
    .ellipsis {
      padding: 0 4px;
    }
    @media (min-width: 600px) {
      .footer {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
      }
      .footer__rpp,
      .pagination {
        inline-size: auto;
      }
      .pagination {
        justify-content: flex-start;
      }
    }

    /* ── Detail drawer ───────────────────────────────────────────────────── */
    .overlay {
      position: fixed;
      inset: 0;
      z-index: var(--_overlay-z);
      display: flex;
      justify-content: flex-end;
      background-color: color-mix(in srgb, var(--md-sys-color-scrim) 32%, transparent);
      animation: fade-in var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
    }
    @keyframes fade-in {
      from {
        opacity: 0;
      }
    }
    .drawer {
      display: flex;
      flex-direction: column;
      inline-size: min(420px, 100vw);
      block-size: 100%;
      background-color: var(--md-sys-color-surface);
      box-shadow: var(--sky-elevation-3);
      animation: slide-in var(--md-sys-motion-duration-medium1)
        var(--md-sys-motion-easing-emphasized-decelerate);
    }
    @keyframes slide-in {
      from {
        transform: translateX(100%);
      }
    }
    .drawer__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 12px 20px;
      border-block-end: 1px solid var(--md-sys-color-outline-variant);
      color: var(--md-sys-color-on-surface);
    }
    .drawer__body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }
    dl.d-list {
      margin: 0;
    }
    dl.d-list > div {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 12px;
      padding: 10px 0;
      border-block-end: 1px solid var(--md-sys-color-outline-variant);
    }
    dl.d-list > div:last-child {
      border-block-end: none;
    }
    dt {
      font-size: var(--md-sys-typescale-label-small-size);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--md-sys-color-on-surface-variant);
    }
    dd {
      margin: 0;
      color: var(--md-sys-color-on-surface);
      overflow-wrap: anywhere;
    }
  `;

  // ── Render ────────────────────────────────────────────────────────────────

  protected override render() {
    const cols       = this._cols;
    const rows       = this._rowData;
    const filterOpts = this._filterOpts;
    const actionDefs = this._actionDefs;
    const totalPages = this._totalPages;
    const hasToolbar = this.searchable || filterOpts.length > 0 || this.exportable;
    const colSpan    = cols.length + (this.selectable ? 1 : 0) + (actionDefs.length ? 1 : 0);
    const from       = this.total > 0 ? (this.page - 1) * this.pageSize + 1 : 0;
    const to         = Math.min(this.page * this.pageSize, this.total);

    return html`
      <span role="status" aria-live="polite" class="sr-only">${this.total} records</span>

      <div class="wrap">

        ${hasToolbar ? html`
          <div class="toolbar" role="toolbar" aria-label="Table controls">
            <div class="toolbar__spacer"></div>

            ${this.searchable ? html`
              <md-outlined-text-field
                class="search-field"
                type="search"
                label=${this.searchPlaceholder}
                .value=${this._search}
                @input=${this._onSearch}
              >
                <md-icon slot="leading-icon" aria-hidden="true">search</md-icon>
              </md-outlined-text-field>
            ` : nothing}

            ${filterOpts.length ? html`
              <md-outlined-select
                class="filter-select"
                label=${this.filterLabel}
                @change=${this._onFilter}
              >
                <md-select-option value="" ?selected=${this._filter === ''}>
                  All
                </md-select-option>
                ${filterOpts.map(o => html`
                  <md-select-option value=${o.value} ?selected=${o.value === this._filter}>
                    ${o.label}
                  </md-select-option>
                `)}
              </md-outlined-select>
            ` : nothing}

            ${this.exportable ? html`
              <md-icon-button
                aria-label="Export as PDF"
                title="Export as PDF"
                @click=${this._exportPdf}
              >
                <md-icon aria-hidden="true">download</md-icon>
              </md-icon-button>
            ` : nothing}
            <slot name="toolbar-actions"></slot>

            <div class="col-selector-wrap">
              <md-icon-button
                aria-label="Select columns"
                title="Select columns"
                aria-haspopup="true"
                aria-expanded=${this._showColSelector ? 'true' : 'false'}
                @click=${this._toggleColSelector}
              >
                <md-icon aria-hidden="true">view_column</md-icon>
              </md-icon-button>

              ${this._showColSelector ? html`
                <div class="col-selector-menu" role="group" aria-labelledby="dt-col-title">
                  <span id="dt-col-title" class="col-selector-menu__title label-medium">Visible columns</span>
                  ${this._allCols.map(col => html`
                    <label class="col-option label-large">
                      <md-checkbox
                        ?checked=${!this._hiddenCols.has(col.key)}
                        @change=${(e: Event) => this._onColToggle(col.key, e)}
                      ></md-checkbox>
                      ${col.label}
                    </label>
                  `)}
                </div>
              ` : nothing}
            </div>
          </div>
        ` : nothing}

        <div class="progress-rail" aria-live="polite">
          ${this.loading
            ? html`<md-linear-progress indeterminate aria-label="Loading data"></md-linear-progress>`
            : nothing}
        </div>

        <div class="scroll">
          <table
            class="body-medium"
            aria-rowcount=${this.total}
            aria-busy=${this.loading ? 'true' : 'false'}
          >
            ${this.caption ? html`<caption class="title-medium">${this.caption}</caption>` : nothing}
            <thead>
              <tr>
                ${this.selectable ? html`
                  <th class="col-cb label-large" scope="col">
                    <md-checkbox
                      aria-label="Select all rows"
                      .checked=${this._allSelected}
                      .indeterminate=${this._indeterminate}
                      @change=${this._onSelectAll}
                    ></md-checkbox>
                  </th>
                ` : nothing}

                ${cols.map(col => html`
                  <th
                    scope="col"
                    class=${col.sortable ? 'label-large col-sort' : 'label-large'}
                    style=${col.width ? `width:${col.width}` : ''}
                    aria-sort=${
                      this._sortKey === col.key
                        ? this._sortDir === 'asc' ? 'ascending' : 'descending'
                        : col.sortable ? 'none' : nothing
                    }
                    tabindex=${col.sortable ? '0' : nothing}
                    @click=${col.sortable ? () => this._onSort(col.key) : nothing}
                    @keydown=${col.sortable
                      ? (e: KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            this._onSort(col.key);
                          }
                        }
                      : nothing}
                  >
                    <span class="th-inner">
                      ${col.label}
                      ${col.sortable ? this._sortIcon(col.key) : nothing}
                    </span>
                  </th>
                `)}

                ${actionDefs.length ? html`<th scope="col" class="col-act label-large">Actions</th>` : nothing}
              </tr>
            </thead>

            <tbody>
              ${this.loading
                ? this._skeletonRows()
                : rows.length === 0
                  ? html`
                    <tr>
                      <td colspan=${colSpan}>
                        <div class="empty" role="status">
                          <md-icon aria-hidden="true">table_rows</md-icon>
                          <p class="body-large">No records found</p>
                        </div>
                      </td>
                    </tr>
                  `
                  : repeat(
                      rows,
                      (_, i) => i,
                      (row, i) => html`
                        <tr
                          class=${this._selected.has(i) ? 'row--selected' : ''}
                          aria-rowindex=${(this.page - 1) * this.pageSize + i + 1}
                          aria-selected=${this.selectable ? String(this._selected.has(i)) : nothing}
                        >
                          ${this.selectable ? html`
                            <td class="col-cb" data-label="">
                              <md-checkbox
                                aria-label="Select row ${i + 1}"
                                .checked=${this._selected.has(i)}
                                @change=${() => this._onSelectRow(i)}
                              ></md-checkbox>
                            </td>
                          ` : nothing}

                          ${cols.map(col => html`
                            <td data-label=${col.label}>${this._cellContent(row[col.key], col)}</td>
                          `)}

                          ${actionDefs.length ? html`
                            <td class="col-act" data-label="">
                              ${actionDefs.map(a => html`
                                <md-icon-button
                                  class=${a.variant === 'danger' ? 'act--danger' : ''}
                                  aria-label="${a.label}: ${String(row[cols[0]?.key] ?? `row ${i + 1}`)}"
                                  title="${a.label}"
                                  @click=${() =>
                                    a.event === '__view_detail__'
                                      ? this._onViewDetail(row)
                                      : this._onAction(a, row, i)
                                  }
                                >
                                  <md-icon aria-hidden="true">${a.icon}</md-icon>
                                </md-icon-button>
                              `)}
                            </td>
                          ` : nothing}
                        </tr>
                      `
                    )
              }
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div class="footer body-small" role="group" aria-label="Table footer">
          <span class="footer__range" aria-live="polite" aria-atomic="true">
            ${this.total > 0 ? `${from} – ${to} of ${this.total}` : '0 records'}
          </span>
          <div class="footer__rpp">
            <span>Rows per page</span>
            <md-outlined-select
              class="rpp-select"
              aria-label="Rows per page"
              @change=${this._onPageSize}
            >
              ${this._pageSizeOptions.map(n => html`
                <md-select-option value=${String(n)} ?selected=${n === this.pageSize}>
                  ${n}
                </md-select-option>
              `)}
            </md-outlined-select>
          </div>
          <nav class="pagination" aria-label="Table pagination">
            <md-icon-button
              aria-label="Previous page"
              ?disabled=${this.page <= 1}
              @click=${() => this._onPage(this.page - 1)}
            >
              <md-icon aria-hidden="true">chevron_left</md-icon>
            </md-icon-button>
            ${this._pageButtons()}
            <md-icon-button
              aria-label="Next page"
              ?disabled=${this.page >= totalPages}
              @click=${() => this._onPage(this.page + 1)}
            >
              <md-icon aria-hidden="true">chevron_right</md-icon>
            </md-icon-button>
          </nav>
        </div>
      </div>

      <!-- Detail drawer (outside .wrap so it overlays the full viewport) -->
      <div
        class="overlay"
        ?hidden=${!this._detailOpen}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dt-drawer-title"
        @click=${(e: Event) => { if (e.target === e.currentTarget) this._closeDetail(); }}
      >
        <div class="drawer">
          <div class="drawer__head">
            <h2 id="dt-drawer-title" class="drawer__title title-large">Details</h2>
            <md-icon-button
              class="close-btn-el"
              aria-label="Close details"
              @click=${this._closeDetail}
            >
              <md-icon aria-hidden="true">close</md-icon>
            </md-icon-button>
          </div>
          <div class="drawer__body">
            ${this._detailRow
              ? html`
                <dl class="d-list">
                  ${Object.entries(this._detailRow).map(([k, v]) => html`
                    <div>
                      <dt>${k}</dt>
                      <dd class="body-medium">${String(v ?? '')}</dd>
                    </div>
                  `)}
                </dl>
              `
              : nothing
            }
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get('sky-data-table')) {
  customElements.define('sky-data-table', SkyDataTable);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-data-table': SkyDataTable;
  }
}
