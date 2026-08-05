import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './showcase.css';
// Opt-in: registers <swiper-container> / <swiper-slide> for the carousel demos.
import '@skylabs-monorepo/shared-ui/carousel';
import {
  applyTheme,
  type ThemeMode,
  FilledButton,
  FilledTonalButton,
  OutlinedButton,
  TextButton,
  ElevatedButton,
  Fab,
  BrandedFab,
  Switch,
  Checkbox,
  Radio,
  OutlinedTextField,
  FilledTextField,
  Dialog,
  ChipSet,
  AssistChip,
  FilterChip,
  InputChip,
  SuggestionChip,
  Slider,
  LinearProgress,
  CircularProgress,
  Tabs,
  PrimaryTab,
  SecondaryTab,
  Icon,
  IconButton,
  FilledIconButton,
  FilledTonalIconButton,
  OutlinedIconButton,
  List,
  ListItem,
  Divider,
  Menu,
  MenuItem,
  SubMenu,
  Ripple,
  FilledSelect,
  OutlinedSelect,
  SelectOption,
} from '@skylabs-monorepo/shared-ui/react';
// sky-* components are raw LIT web component tags — no React adapter needed.
// They are registered globally via main.tsx → import '@skylabs-monorepo/shared-ui'.

// ── Data table demo ──────────────────────────────────────────────────────────

const SERVICES = ['Thai Bliss', 'Deep Tissue', 'Swedish Relax', 'Hot Stone', 'Aromatherapy'];
const LOCATIONS = ['Philadelphia', 'New York', 'Boston', 'Chicago', 'Miami'];
const STATUSES = ['Active', 'Pending', 'Expired'] as const;
const DURATIONS = ['60 min', '90 min', '120 min'];

const ALL_DEALS = Array.from({ length: 100 }, (_, i) => ({
  id:       `DEAL-${String(i + 1).padStart(4, '0')}`,
  name:     `${SERVICES[i % 5]} #{i + 1}`,
  location: LOCATIONS[i % 5],
  duration: DURATIONS[i % 3],
  price:    `$${50 + ((i * 7) % 150)}`,                                                               
  status:   STATUSES[i % 3],
}));

const DT_COLUMNS = JSON.stringify([
  { key: 'id',       label: 'Deal ID',      sortable: true, width: '130px' },
  { key: 'name',     label: 'Service Name', sortable: true },
  { key: 'location', label: 'Location',     sortable: true },
  { key: 'duration', label: 'Duration' },
  { key: 'price',    label: 'Price',        sortable: true },
  { key: 'status',   label: 'Status',       type: 'status',
    statusMap: { Active: 'success', Pending: 'warning', Expired: 'error' } },
]);

const DT_ACTIONS = JSON.stringify([
  { icon: 'visibility', label: 'View details', event: '__view_detail__' },
  { icon: 'edit',       label: 'Edit',         event: 'edit' },
  { icon: 'delete',     label: 'Delete',       event: 'delete', variant: 'danger' },
]);

const DT_FILTERS = JSON.stringify([
  { label: 'Active',  value: 'Active' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Expired', value: 'Expired' },
]);

// ── Booking table constants (filter showcase — no PDF) ────────────────────────

const THERAPISTS = ['Aria Chen', 'Marcus Bell', 'Sofia Park', 'James Rivera', 'Priya Nair'];
const BOOKING_STATUSES = ['Active', 'Completed', 'Cancelled'] as const;

const ALL_BOOKINGS = Array.from({ length: 60 }, (_, i) => ({
  id:        `BK-${String(i + 1).padStart(3, '0')}`,
  therapist: THERAPISTS[i % 5],
  service:   SERVICES[i % 5],
  date:      `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  duration:  DURATIONS[i % 3],
  status:    BOOKING_STATUSES[i % 3],
}));

const BK_COLUMNS = JSON.stringify([
  { key: 'id',        label: 'Booking ID', sortable: true, width: '110px' },
  { key: 'therapist', label: 'Therapist',  sortable: true },
  { key: 'service',   label: 'Service',    sortable: true },
  { key: 'date',      label: 'Date',       sortable: true },
  { key: 'duration',  label: 'Duration' },
  { key: 'status',    label: 'Status',     type: 'status',
    statusMap: { Active: 'success', Completed: 'primary', Cancelled: 'error' } },
]);

const BK_ACTIONS = JSON.stringify([
  { icon: 'visibility', label: 'View details', event: '__view_detail__' },
]);

const BK_FILTERS = JSON.stringify([
  { label: 'Active',    value: 'Active' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Cancelled', value: 'Cancelled' },
]);

// ── Revenue table constants (PDF export showcase — no filter) ─────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ALL_REVENUE = Array.from({ length: 36 }, (_, i) => {
  const gv = ((i * 7 + 3) % 30) - 10;
  return {
    month:    `${MONTHS[i % 12]} ${2024 + Math.floor(i / 12)}`,
    service:  SERVICES[i % 5],
    sessions: String(40 + (i * 13) % 61),
    revenue:  `$${(1200 + (i * 89) % 3800).toLocaleString()}`,
    growth:   `${gv >= 0 ? '+' : ''}${gv.toFixed(1)}%`,
  };
});

const RV_COLUMNS = JSON.stringify([
  { key: 'month',    label: 'Month',    sortable: true, width: '120px' },
  { key: 'service',  label: 'Service',  sortable: true },
  { key: 'sessions', label: 'Sessions', sortable: true },
  { key: 'revenue',  label: 'Revenue',  sortable: true },
  { key: 'growth',   label: 'Growth %' },
]);

// ── Top services constants (minimal — sort only, no toolbar) ──────────────────

const TOP_SERVICES = [
  { rank: '1', service: 'Swedish Relax', bookings: '2,847', avgRating: '4.9', avgPrice: '$89'  },
  { rank: '2', service: 'Deep Tissue',   bookings: '2,431', avgRating: '4.8', avgPrice: '$99'  },
  { rank: '3', service: 'Hot Stone',     bookings: '1,986', avgRating: '4.7', avgPrice: '$115' },
  { rank: '4', service: 'Aromatherapy',  bookings: '1,654', avgRating: '4.6', avgPrice: '$79'  },
  { rank: '5', service: 'Thai Bliss',    bookings: '1,322', avgRating: '4.5', avgPrice: '$94'  },
];

const TS_COLUMNS = JSON.stringify([
  { key: 'rank',      label: '#',          width: '48px' },
  { key: 'service',   label: 'Service',    sortable: true },
  { key: 'bookings',  label: 'Bookings',   sortable: true },
  { key: 'avgRating', label: 'Avg Rating', sortable: true },
  { key: 'avgPrice',  label: 'Avg Price',  sortable: true },
]);

interface DtParams {
  page: number;
  pageSize: number;
  sortKey: string;
  sortDir: 'asc' | 'desc' | '';
  search: string;
  filter: string;
}

function useDealTable() {
  const [params, setParams] = useState<DtParams>({
    page: 1, pageSize: 10, sortKey: '', sortDir: '', search: '', filter: '',
  });
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    let data = [...ALL_DEALS];
    if (params.search) {
      const q = params.search.toLowerCase();
      data = data.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (params.filter) data = data.filter(r => r.status === params.filter);
    if (params.sortKey) {
      const key = params.sortKey as keyof (typeof ALL_DEALS)[0];
      data.sort((a, b) => {
        const cmp = String(a[key]).localeCompare(String(b[key]));
        return params.sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return data;
  }, [params.search, params.filter, params.sortKey, params.sortDir]);

  const pageRows = useMemo(
    () => filtered.slice((params.page - 1) * params.pageSize, params.page * params.pageSize),
    [filtered, params.page, params.pageSize],
  );

  const onParamsChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<DtParams>).detail;
    setLoading(true);
    // Simulate 300 ms network round-trip so the preloader is visible.
    setTimeout(() => { setParams(detail); setLoading(false); }, 300);
  }, []);

  return {
    rows:    JSON.stringify(pageRows),
    total:   filtered.length,
    loading,
    onParamsChange,
  };
}

function useBookingTable() {
  const [params, setParams] = useState<DtParams>({
    page: 1, pageSize: 10, sortKey: '', sortDir: '', search: '', filter: '',
  });
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    let data = [...ALL_BOOKINGS];
    if (params.search) {
      const q = params.search.toLowerCase();
      data = data.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (params.filter) data = data.filter(r => r.status === params.filter);
    if (params.sortKey) {
      const key = params.sortKey as keyof (typeof ALL_BOOKINGS)[0];
      data.sort((a, b) => {
        const cmp = String(a[key]).localeCompare(String(b[key]));
        return params.sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return data;
  }, [params.search, params.filter, params.sortKey, params.sortDir]);

  const pageRows = useMemo(
    () => filtered.slice((params.page - 1) * params.pageSize, params.page * params.pageSize),
    [filtered, params.page, params.pageSize],
  );

  const onParamsChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<DtParams>).detail;
    setLoading(true);
    setTimeout(() => { setParams(detail); setLoading(false); }, 300);
  }, []);

  return { rows: JSON.stringify(pageRows), total: filtered.length, loading, onParamsChange };
}

function useRevenueTable() {
  const [params, setParams] = useState<DtParams>({
    page: 1, pageSize: 10, sortKey: '', sortDir: '', search: '', filter: '',
  });
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    let data = [...ALL_REVENUE];
    if (params.search) {
      const q = params.search.toLowerCase();
      data = data.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (params.sortKey) {
      const key = params.sortKey as keyof (typeof ALL_REVENUE)[0];
      data.sort((a, b) => {
        const cmp = String(a[key]).localeCompare(String(b[key]));
        return params.sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return data;
  }, [params.search, params.sortKey, params.sortDir]);

  const pageRows = useMemo(
    () => filtered.slice((params.page - 1) * params.pageSize, params.page * params.pageSize),
    [filtered, params.page, params.pageSize],
  );

  const onParamsChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<DtParams>).detail;
    setLoading(true);
    setTimeout(() => { setParams(detail); setLoading(false); }, 300);
  }, []);

  return { rows: JSON.stringify(pageRows), total: filtered.length, loading, onParamsChange };
}

// ── End data table demo ───────────────────────────────────────────────────────

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse ' +
  'malesuada lacus ex, sit amet blandit leo lobortis eget.';

/** A Swiper Element instance once registered (has the imperative init API). */
type SwiperEl = HTMLElement & {
  initialize: () => void;
  [key: string]: unknown;
};

/**
 * Apply Swiper params that are OBJECTS (e.g. `pagination: { type: 'fraction' }`).
 *
 * Flat params (slides-per-view, loop, …) work fine as JSX attributes, but React
 * doesn't reliably merge nested `pagination-*` attributes into the pagination
 * object before Swiper auto-initializes. So for object params we render the
 * container with `init="false"`, assign the params as properties, then call
 * `initialize()` — Swiper's documented escape hatch. `params` must be a stable
 * (module-scope) reference so this runs once.
 */
function useSwiperParams(params: Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current as SwiperEl | null;
    if (!el) return;
    Object.assign(el, params);
    el.initialize();
  }, [params]);
  return ref;
}

// Object-param configs for demos 8 and 9 (see useSwiperParams above).
const PAGINATION_DYNAMIC = {
  loop: true,
  pagination: { dynamicBullets: true },
};
const PAGINATION_FRACTION = {
  navigation: true,
  pagination: { type: 'fraction' },
};

/**
 * Demo page for msd. Every control here is a Material 3 web component coming
 * from @skylabs-monorepo/shared-ui, themed by msd's own (green) palette. The
 * toggle calls applyTheme() to switch the <html> theme class live.
 */
export function Showcase() {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [menuOpen, setMenuOpen] = useState(false);
  const dialogRef = useRef<
    HTMLElement & { show: () => void; close: () => void }
  >(null);

  const toggleMode = () => {
    const next: ThemeMode = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    applyTheme(next);
  };

  // Demos 8 & 9 use object params, applied imperatively (see useSwiperParams).
  const dynamicRef = useSwiperParams(PAGINATION_DYNAMIC);
  const fractionRef = useSwiperParams(PAGINATION_FRACTION);

  const dt = useDealTable();
  const dtRef = useRef<HTMLElement>(null);

  const bk = useBookingTable();
  const bkRef = useRef<HTMLElement>(null);

  const rv = useRevenueTable();
  const rvRef = useRef<HTMLElement>(null);

  const tsRef = useRef<HTMLElement>(null);
  const [tsSort, setTsSort] = useState({ key: '', dir: '' as 'asc' | 'desc' | '' });
  const tsRows = useMemo(() => {
    if (!tsSort.key) return TOP_SERVICES;
    const key = tsSort.key as keyof (typeof TOP_SERVICES)[0];
    return [...TOP_SERVICES].sort((a, b) => {
      const cmp = String(a[key]).localeCompare(String(b[key]));
      return tsSort.dir === 'desc' ? -cmp : cmp;
    });
  }, [tsSort.key, tsSort.dir]);
  const onTsParamsChange = useCallback((e: Event) => {
    const { sortKey, sortDir } = (e as CustomEvent<DtParams>).detail;
    setTsSort({ key: sortKey, dir: sortDir });
  }, []);

  useEffect(() => {
    const el = dtRef.current;
    if (!el) return;
    el.addEventListener('sky-dt-params-change', dt.onParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', dt.onParamsChange);
  }, [dt.onParamsChange]);

  useEffect(() => {
    const el = bkRef.current;
    if (!el) return;
    el.addEventListener('sky-dt-params-change', bk.onParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', bk.onParamsChange);
  }, [bk.onParamsChange]);

  useEffect(() => {
    const el = rvRef.current;
    if (!el) return;
    el.addEventListener('sky-dt-params-change', rv.onParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', rv.onParamsChange);
  }, [rv.onParamsChange]);

  useEffect(() => {
    const el = tsRef.current;
    if (!el) return;
    el.addEventListener('sky-dt-params-change', onTsParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', onTsParamsChange);
  }, [onTsParamsChange]);

  // Demo slides. `auto` adds a fixed width so `slides-per-view="auto"` works.
  const slideNums = [1, 2, 3, 4, 5, 6, 7, 8];
  const slides = (auto = false) =>
    slideNums.map((n) => (
      <swiper-slide
        key={n}
        className={auto ? 'demo-slide demo-slide--auto' : 'demo-slide'}
      >
        {n}
      </swiper-slide>
    ));

  return (
    <main className="showcase">
      <title>Component showcase · MSD</title>
      <header className="showcase__bar">
        <div className="showcase__title">
          <h1>msd</h1>
          <sky-badge>M3</sky-badge>
        </div>
        <label className="showcase__toggle">
          <span>{mode === 'dark' ? 'Dark' : 'Light'}</span>
          <Switch selected={mode === 'dark'} onChange={toggleMode} />
        </label>
      </header>

      <section className="showcase__card">
        <h2>Buttons</h2>
        <div className="showcase__row">
          <FilledButton>Filled</FilledButton>
          <FilledTonalButton>Tonal</FilledTonalButton>
          <ElevatedButton>Elevated</ElevatedButton>
          <OutlinedButton>Outlined</OutlinedButton>
          <TextButton>Text</TextButton>
          <FilledIconButton aria-label="Add to favorites">
            <Icon aria-hidden="true">favorite</Icon>
          </FilledIconButton>
        </div>
      </section>

      <section className="showcase__card">
        <h2>Chips</h2>
        <ChipSet>
          <AssistChip label="Assist">
            <Icon slot="icon" aria-hidden="true">event</Icon>
          </AssistChip>
          <FilterChip label="Filter" selected />
          <FilterChip label="Another filter" />
          <InputChip label="Input" />
          <SuggestionChip label="Suggestion" />
        </ChipSet>
      </section>

      <section className="showcase__card">
        <h2>Icon buttons</h2>
        <div className="showcase__row">
          <IconButton aria-label="Settings">
            <Icon>settings</Icon>
          </IconButton>
          <FilledIconButton aria-label="Favorite">
            <Icon>favorite</Icon>
          </FilledIconButton>
          <FilledTonalIconButton aria-label="Bookmark">
            <Icon>bookmark</Icon>
          </FilledTonalIconButton>
          <OutlinedIconButton aria-label="Share">
            <Icon>share</Icon>
          </OutlinedIconButton>
          <FilledIconButton aria-label="Toggle favorite" toggle>
            <Icon>favorite_border</Icon>
            <Icon slot="selected">favorite</Icon>
          </FilledIconButton>
        </div>
      </section>

      <section className="showcase__card">
        <h2>FAB &amp; extended FAB</h2>
        <div className="showcase__row">
          <Fab size="small" aria-label="Add">
            <Icon slot="icon">add</Icon>
          </Fab>
          <Fab aria-label="Edit" variant="primary">
            <Icon slot="icon">edit</Icon>
          </Fab>
          <Fab size="large" aria-label="Navigate">
            <Icon slot="icon">navigation</Icon>
          </Fab>
          <Fab label="Compose" variant="primary">
            <Icon slot="icon">edit</Icon>
          </Fab>
          <BrandedFab label="Create" aria-label="Create">
            <Icon slot="icon">add</Icon>
          </BrandedFab>
        </div>
      </section>

      <section className="showcase__card">
        <h2>Selection</h2>
        <div className="showcase__row">
          <label className="showcase__inline">
            <Checkbox checked /> Checked
          </label>
          <label className="showcase__inline">
            <Checkbox indeterminate /> Indeterminate
          </label>
          <label className="showcase__inline">
            <Checkbox /> Unchecked
          </label>
        </div>
        <div className="showcase__row" role="radiogroup" aria-label="Plan">
          <label className="showcase__inline">
            <Radio name="plan" value="a" checked /> Basic
          </label>
          <label className="showcase__inline">
            <Radio name="plan" value="b" /> Pro
          </label>
          <label className="showcase__inline">
            <Radio name="plan" value="c" /> Max
          </label>
        </div>
        <div className="showcase__row">
          <label className="showcase__inline">
            <Switch /> Off
          </label>
          <label className="showcase__inline">
            <Switch selected /> On
          </label>
          <label className="showcase__inline">
            <Switch selected icons /> With icons
          </label>
        </div>
      </section>

      <section className="showcase__card">
        <h2>Text fields</h2>
        <div className="fields-grid">
          <FilledTextField label="Filled" value="Hello" />
          <OutlinedTextField label="Outlined" placeholder="Type here" />
          <OutlinedTextField label="With icons" placeholder="Search">
            <Icon slot="leading-icon" aria-hidden="true">search</Icon>
            <Icon slot="trailing-icon" aria-hidden="true">close</Icon>
          </OutlinedTextField>
          <FilledTextField
            label="Amount"
            type="number"
            prefixText="$"
            suffixText=".00"
          />
          <OutlinedTextField
            label="Email"
            type="email"
            supportingText="We'll never share it"
          />
          <FilledTextField label="Password" type="password" value="secret" />
          <OutlinedTextField label="Bio (textarea)" type="textarea" rows={3} />
          <FilledTextField label="With counter" maxLength={20} value="Count me" />
          <OutlinedTextField
            label="Required"
            required
            error
            errorText="This field is required"
          />
        </div>
      </section>

      <section className="showcase__card">
        <h2>Select</h2>
        <div className="showcase__row">
          <FilledSelect label="Filled" value="apple">
            <SelectOption value="apple">
              <div slot="headline">Apple</div>
            </SelectOption>
            <SelectOption value="banana">
              <div slot="headline">Banana</div>
            </SelectOption>
            <SelectOption value="cherry">
              <div slot="headline">Cherry</div>
            </SelectOption>
          </FilledSelect>
          <OutlinedSelect label="Outlined" value="banana">
            <SelectOption value="apple">
              <div slot="headline">Apple</div>
            </SelectOption>
            <SelectOption value="banana">
              <div slot="headline">Banana</div>
            </SelectOption>
            <SelectOption value="cherry">
              <div slot="headline">Cherry</div>
            </SelectOption>
          </OutlinedSelect>
        </div>
      </section>

      <section className="showcase__card">
        <h2>Slider</h2>
        <p className="demo-label">Continuous</p>
        <Slider value={50} aria-label="Continuous value" />
        <p className="demo-label">Discrete (ticks + labeled)</p>
        <Slider value={3} min={0} max={10} step={1} ticks labeled aria-label="Discrete value" />
        <p className="demo-label">Range</p>
        <Slider range valueStart={20} valueEnd={70} aria-label="Range value" />
      </section>

      <section className="showcase__card">
        <h2>Menu</h2>
        <span className="menu-anchor-wrap">
          <FilledButton
            id="msd-menu-anchor"
            onClick={() => setMenuOpen((o) => !o)}
          >
            Open menu
          </FilledButton>
          <Menu
            anchor="msd-menu-anchor"
            open={menuOpen}
            positioning="popover"
            onClosed={() => setMenuOpen(false)}
          >
            <MenuItem>
              <div slot="headline">Profile</div>
            </MenuItem>
            <MenuItem>
              <div slot="headline">Settings</div>
            </MenuItem>
            <Divider role="separator" />
            <SubMenu>
              <MenuItem slot="item">
                <div slot="headline">More tools</div>
                <Icon slot="end" aria-hidden="true">chevron_right</Icon>
              </MenuItem>
              <Menu slot="menu">
                <MenuItem>
                  <div slot="headline">Import</div>
                </MenuItem>
                <MenuItem>
                  <div slot="headline">Export</div>
                </MenuItem>
              </Menu>
            </SubMenu>
            <Divider role="separator" />
            <MenuItem>
              <div slot="headline">Sign out</div>
            </MenuItem>
          </Menu>
        </span>
      </section>

      <section className="showcase__card">
        <h2>Tabs</h2>
        <p className="demo-label">Primary</p>
        <Tabs>
          <PrimaryTab>
            <Icon slot="icon" aria-hidden="true">dashboard</Icon>
            Overview
          </PrimaryTab>
          <PrimaryTab>
            <Icon slot="icon" aria-hidden="true">timeline</Icon>
            Activity
          </PrimaryTab>
          <PrimaryTab>
            <Icon slot="icon" aria-hidden="true">settings</Icon>
            Settings
          </PrimaryTab>
        </Tabs>
        <p className="demo-label">Secondary</p>
        <Tabs>
          <SecondaryTab>Flights</SecondaryTab>
          <SecondaryTab>Hotels</SecondaryTab>
          <SecondaryTab>Cars</SecondaryTab>
        </Tabs>
      </section>

      <section className="showcase__card">
        <h2>Progress</h2>
        <p className="demo-label">Linear</p>
        <div className="progress-stack">
          <LinearProgress value={0.6} aria-label="Determinate" />
          <LinearProgress indeterminate aria-label="Indeterminate" />
        </div>
        <p className="demo-label">Circular</p>
        <div className="showcase__row">
          <CircularProgress value={0.6} aria-label="Determinate" />
          <CircularProgress indeterminate aria-label="Indeterminate" />
          <CircularProgress indeterminate fourColor aria-label="Four color" />
        </div>
      </section>

      <section className="showcase__card">
        <h2>Ripple</h2>
        <button type="button" className="ripple-surface">
          <Ripple />
          Press me
        </button>
      </section>

      <section className="showcase__card">
        <h2>Dialog</h2>
        <FilledButton onClick={() => dialogRef.current?.show()}>
          Open dialog
        </FilledButton>
        <Dialog ref={dialogRef}>
          <div slot="headline">Themed dialog</div>
          <div slot="content">
            This dialog and every control on this page share msd's green M3
            theme.
          </div>
          <div slot="actions">
            <TextButton onClick={() => dialogRef.current?.close()}>
              Got it
            </TextButton>
          </div>
        </Dialog>
      </section>

      <section className="showcase__card">
        <h2>List</h2>
        <List>
          <ListItem>
            <Icon slot="start" aria-hidden="true">label</Icon>
            <div slot="headline">Default with start icon</div>
          </ListItem>
          <Divider />
          <ListItem>
            <div slot="headline">Cucumber</div>
            <div slot="supporting-text">
              Cucumbers are long green fruits that are just as long as this
              multi-line description
            </div>
            <Icon slot="end" aria-hidden="true">check</Icon>
          </ListItem>
          <ListItem
            type="link"
            href="https://google.com/search?q=buy+kiwis&tbm=shop"
            target="_blank"
          >
            <div slot="headline">Shop for Kiwis</div>
            <div slot="supporting-text">
              This will link you out in a new tab
            </div>
            <Icon slot="end" aria-hidden="true">open_in_new</Icon>
          </ListItem>
        </List>
      </section>

      <section className="showcase__card">
        <h2>Cards</h2>
        <div className="cards-grid">
          <sky-product-card
            image="https://picsum.photos/seed/spa/600/400"
            imageAlt="Massage therapy"
            badge="Popular Gift"
            favorite
            eyebrow="Just Relax Spa"
            heading="Enjoy a 90-minute VIP facial and body massage package"
            location="Center City East, Philadelphia"
            distance="11 mi"
            rating={4.7}
            reviews={783}
            originalPrice="$220"
            price="$159"
            discount="-28%"
            priceNote="$119.25 with code SUMMER"
          />
          <sky-product-card
            variant="outlined"
            image="https://picsum.photos/seed/grandhotel/600/400"
            imageAlt="The Grand Hotel at night"
            favorite
            tag="Hotel"
            tagIcon="hotel"
            heading="The Grand Hotel at the Grand Canyon"
            location="Tusayan, United States"
            score={8.5}
            scoreLabel="Very Good"
            reviews={4798}
            pricePrefix="Starting from"
            originalPrice="$215"
            price="$172"
          />
          <sky-image-card
            image="https://picsum.photos/seed/cottages/600/800"
            imageAlt="Children playing in a cottage garden"
            label="Cottages"
            href="#cottages"
          />
          <sky-category-card
            image="https://picsum.photos/seed/losangeles/600/600"
            imageAlt="Los Angeles hills"
            heading="Los Angeles"
            subheading="4,781 properties"
            href="#los-angeles"
          />
          <sky-info-card
            align="center"
            icon="support_agent"
            heading="Trusted 24/7 customer service you can rely on"
            subheading="We're always here to help"
          />
        </div>
      </section>

      <section className="showcase__card">
        <h2>Accordion</h2>
        <sky-accordion>
          <sky-accordion-item header="Accordion 1" open>
            {LOREM}
          </sky-accordion-item>
          <sky-accordion-item header="Accordion 2" open>
            {LOREM}
          </sky-accordion-item>
          <sky-accordion-item header="Accordion Actions">
            {LOREM}
          </sky-accordion-item>
        </sky-accordion>
      </section>

      <section className="showcase__card">
        <h2>Carousel (Swiper Element)</h2>

        <h3 className="demo-carousel__label">1. Default</h3>
        <swiper-container
          className="demo-carousel"
          navigation="true"
          pagination="true"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">2. Scrollbar</h3>
        <swiper-container className="demo-carousel" scrollbar="true">
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">3. Space between</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="3"
          space-between="30"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">4. Slides per view: auto</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="auto"
          space-between="16"
        >
          {slides(true)}
        </swiper-container>

        <h3 className="demo-carousel__label">5. Scroll container (free mode)</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="auto"
          space-between="16"
          free-mode="true"
          scrollbar="true"
        >
          {slides(true)}
        </swiper-container>

        <h3 className="demo-carousel__label">6. Infinite loop</h3>
        <swiper-container
          className="demo-carousel"
          loop="true"
          navigation="true"
          slides-per-view="3"
          space-between="16"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">7. Grab cursor</h3>
        <swiper-container
          className="demo-carousel"
          grab-cursor="true"
          slides-per-view="3"
          space-between="16"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">8. Pagination: dynamic</h3>
        <swiper-container ref={dynamicRef} className="demo-carousel" init="false">
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">9. Pagination: fraction</h3>
        <swiper-container
          ref={fractionRef}
          className="demo-carousel"
          init="false"
        >
          {slides()}
        </swiper-container>

        <h3 className="demo-carousel__label">10. Centered + auto</h3>
        <swiper-container
          className="demo-carousel"
          slides-per-view="auto"
          centered-slides="true"
          space-between="16"
        >
          {slides(true)}
        </swiper-container>
      </section>

      <section className="showcase__card">
        <h2>Data Table</h2>
        <p className="demo-label">
          100 records · lazy loading · search · filter · sort · PDF export ·
          row selection · view /  / delete actions · detail drawer
        </p>
        {/* sky-data-table is a raw LIT web component — events are wired via
            dtRef + addEventListener in useEffect above. */}
        <sky-data-table
          ref={dtRef as React.RefObject<HTMLElement>}
          caption="Massage Deals"
          columns={DT_COLUMNS}
          rows={dt.rows}
          total={dt.total}
          loading={dt.loading}
          page-size={10}
          searchable
          search-placeholder="Search deals…"
          filter-label="Filter by Status"
          filter-options={DT_FILTERS}
          selectable
          exportable
          actions={DT_ACTIONS}
        />
      </section>

      <section className="showcase__card">
        <h2>Data Table — Filter by Status (no PDF export)</h2>
        <p className="demo-label">
          60 bookings · search · filter by status (Active / Completed / Cancelled) · sort · view details — no PDF export button
        </p>
        <sky-data-table
          ref={bkRef as React.RefObject<HTMLElement>}
          caption="Therapist Bookings"
          columns={BK_COLUMNS}
          rows={bk.rows}
          total={bk.total}
          loading={bk.loading}
          page-size={10}
          searchable
          search-placeholder="Search bookings…"
          filter-label="Filter by Status"
          filter-options={BK_FILTERS}
          actions={BK_ACTIONS}
        />
      </section>

      <section className="showcase__card">
        <h2>Data Table — PDF Export (no filter dropdown)</h2>
        <p className="demo-label">
          36 records · search · sort · exportable PDF — filter dropdown omitted entirely
        </p>
        <sky-data-table
          ref={rvRef as React.RefObject<HTMLElement>}
          caption="Monthly Revenue"
          columns={RV_COLUMNS}
          rows={rv.rows}
          total={rv.total}
          loading={rv.loading}
          page-size={10}
          searchable
          search-placeholder="Search revenue…"
          exportable
        />
      </section>

      <section className="showcase__card">
        <h2>Data Table — Minimal (sort only)</h2>
        <p className="demo-label">
          5 records · sort only — no search, no filter, no export, no row selection, no actions
        </p>
        <sky-data-table
          ref={tsRef as React.RefObject<HTMLElement>}
          caption="Top Services"
          columns={TS_COLUMNS}
          rows={JSON.stringify(tsRows)}
          total={TOP_SERVICES.length}
          page-size={10}
        />
      </section>
    </main>
  );
}

export default Showcase;
