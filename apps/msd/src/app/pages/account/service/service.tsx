import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { ServiceForm } from './serviceForm';

interface DtParams {
  page: number;
  pageSize: number;
  sortKey: string;
  sortDir: 'asc' | 'desc' | '';
  search: string;
  filter: string;
}

const SERVICES = [
  'Thai Bliss',
  'Deep Tissue',
  'Swedish Relax',
  'Hot Stone',
  'Aromatherapy',
];
const SERVICE_TYPES = ["Single", "Package", "AMC"] as const;
const LOCATIONS = ['Philadelphia', 'New York', 'Boston', 'Chicago', 'Miami'];
const STATUSES = ['Active', 'Pending', 'Expired'] as const;
const DURATIONS = ['60 min', '90 min', '120 min'];

const ALL_SERVICES = Array.from({ length: 100 }, (_, i) => ({
  service_name: `Service ${i + 1}`,
  service_type: SERVICE_TYPES[i % 3],
  short_description: `Short description for Service ${i + 1}`,
  full_description: `This is the detailed description for Service ${i + 1}.`,
  image_gallery: [
    `https://picsum.photos/200/200?random=${i + 1}`,
    `https://picsum.photos/200/200?random=${i + 101}`,
    `https://picsum.photos/200/200?random=${i + 201}`,
  ],
  duration_minutes: [30, 60, 90, 120][i % 4],
  base_price: 500 + i * 50,
  discounted_price: 450 + i * 45,
  tax_percent: 18,
  what_is_included: [
    "Professional Service",
    "Equipment Included",
    "Customer Support",
  ],
  what_is_excluded: [
    "Transportation Charges",
    "Extra Materials",
  ],
  warranty_days: [0, 30, 60, 90][i % 4],
  cancellation_policy: "Free cancellation up to 24 hours before booking.",
  min_booking_notice_hours: 2,
  faqs: [
    {
      question: "Is advance booking required?",
      answer: "Yes, minimum 2 hours before the service.",
    },
    {
      question: "Can I cancel my booking?",
      answer: "Yes, according to the cancellation policy.",
    },
  ],
  rating_avg: (4 + (i % 10) / 10).toFixed(1),
  total_bookings: 100 + i * 5,
  applicable_cities: ["Delhi", "Mumbai", "Bangalore"],
  status: STATUSES[i % 2],
}));


const DT_COLUMNS = JSON.stringify([
  {
    key: "service_name",
    label: "Service Name",
    sortable: true,
  },
  {
    key: "service_type",
    label: "Service Type",
    sortable: true,
  },
  {
    key: "short_description",
    label: "Short Description",
  },
  {
    key: "duration_minutes",
    label: "Duration (Min)",
    sortable: true,
  },
  {
    key: "base_price",
    label: "Base Price",
    sortable: true,
  },
  {
    key: "discounted_price",
    label: "Discount Price",
    sortable: true,
  },
  {
    key: "tax_percent",
    label: "Tax (%)",
    sortable: true,
  },
  {
    key: "warranty_days",
    label: "Warranty (Days)",
    sortable: true,
  },
  {
    key: "rating_avg",
    label: "Rating",
    sortable: true,
  },
  {
    key: "total_bookings",
    label: "Bookings",
    sortable: true,
  },
  {
    key: "status",
    label: "Status",
    type: "status",
    statusMap: {
      Active: "success",
      Inactive: "error",
    },
  },
]);

const DT_ACTIONS = JSON.stringify([
  { icon: 'visibility', label: 'View details', event: '__view_detail__' },
  { icon: 'edit', label: 'Edit', event: 'edit' },
  { icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' },
]);

const DT_FILTERS = JSON.stringify([
  { label: 'Active', value: 'Active' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Expired', value: 'Expired' },
]);

function useDealTable() {
  const [params, setParams] = useState<DtParams>({
    page: 1,
    pageSize: 10,
    sortKey: '',
    sortDir: '',
    search: '',
    filter: '',
  });
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    let data = [...ALL_SERVICES];
    if (params.search) {
      const q = params.search.toLowerCase();
      data = data.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    if (params.filter) data = data.filter((r) => r.status === params.filter);
    if (params.sortKey) {
      const key = params.sortKey as keyof (typeof ALL_SERVICES)[0];
      data.sort((a, b) => {
        const cmp = String(a[key]).localeCompare(String(b[key]));
        return params.sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return data;
  }, [params.search, params.filter, params.sortKey, params.sortDir]);

  const pageRows = useMemo(
    () =>
      filtered.slice(
        (params.page - 1) * params.pageSize,
        params.page * params.pageSize,
      ),
    [filtered, params.page, params.pageSize],
  );

  const onParamsChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<DtParams>).detail;
    setLoading(true);
    // Simulate 300 ms network round-trip so the preloader is visible.
    setTimeout(() => {
      setParams(detail);
      setLoading(false);
    }, 300);
  }, []);

  return {
    rows: JSON.stringify(pageRows),
    total: filtered.length,
    loading,
    onParamsChange,
  };
}

// Object-param configs for demos 8 and 9 (see useSwiperParams above).
// const PAGINATION_DYNAMIC = {
//   loop: true,
//   pagination: { dynamicBullets: true },
// };
// const PAGINATION_FRACTION = {
//   navigation: true,
//   pagination: { type: 'fraction' },
// };

export function ServicePage() {
  const [open, setOpen] = useState(false);
  // const dynamicRef = useSwiperParams(PAGINATION_DYNAMIC);
  //   const fractionRef = useSwiperParams(PAGINATION_FRACTION);

  const dt = useDealTable();
  const dtRef = useRef<HTMLElement>(null);

  const handleSave = (data: any) => {
  console.log(data);
  setOpen(false);
};

  useEffect(() => {
    const el = dtRef.current;
    if (!el) return;
    el.addEventListener('sky-dt-params-change', dt.onParamsChange);
    return () =>
      el.removeEventListener('sky-dt-params-change', dt.onParamsChange);
  }, [dt.onParamsChange]);

  return (
    <div className="category-page">
      {/* Header */}
      <div className="page-header">
        <h1>Service</h1>

         {!open && (
          <div className="add-btn">
            <FilledButton onClick={() => {
                 console.log("Button Clicked");
                setOpen(true)}}>
             <span className="plus-icon">+</span>
            </FilledButton>
          </div>
        )}

      </div>

      {/* FORM */}
     {open ? (
        <ServiceForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* TABLE */}
          <section className="showcase__card">
            <h2>Data Table</h2>
            <p className="demo-label">
              100 records · lazy loading · search · filter · sort · PDF export ·
              row selection · view / / delete actions · detail drawer
            </p>
            {/* sky-data-table is a raw LIT web component — events are wired via
                                dtRef + addEventListener in useEffect above. */}
            <sky-data-table
              ref={dtRef as React.RefObject<HTMLElement>}
              caption="Services"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Services.."
              filter-label="Filter by Status"
              filter-options={DT_FILTERS}
              selectable
              exportable
              actions={DT_ACTIONS}
            />
          </section>
        </>
      )}
    </div>
  );
}
