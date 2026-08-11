import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { VendorForm } from "./vendorForm";

interface DtParams {
  page: number;
  pageSize: number;
  sortKey: string;
  sortDir: "asc" | "desc" | "";
  search: string;
  filter: string;
}

/* -------------------------------------------------------------------------- */
/*                                DUMMY DATA                                  */
/* -------------------------------------------------------------------------- */

const ALL_VENDORS = Array.from({ length: 100 }, (_, i) => ({
  slug: `vendor-${i + 1}`,
  name: `Vendor ${i + 1}`,
  description: `Description for Vendor ${i + 1}`,
  address: `${100 + i}, MG Road`,
  city: ["Bangalore", "Delhi", "Mumbai", "Hyderabad"][i % 4],
  location: [
    "Koramangala, Bangalore",
    "Connaught Place, Delhi",
    "Andheri, Mumbai",
    "Banjara Hills, Hyderabad",
  ][i % 4],
  coordinates: {
    lat: 12.9716 + i * 0.001,
    lng: 77.5946 + i * 0.001,
  },
  phone: `9876543${String(i).padStart(3, "0")}`,
  email: `vendor${i + 1}@gmail.com`,
  website: `https://vendor${i + 1}.com`,
  image: `https://picsum.photos/200?random=${i + 1}`,
  imageAlt: `Vendor ${i + 1}`,
  gallery: [
    `https://picsum.photos/400/300?random=${i + 1}`,
    `https://picsum.photos/400/300?random=${i + 101}`,
    `https://picsum.photos/400/300?random=${i + 201}`,
  ],
  rating: Number((4 + (i % 10) / 10).toFixed(1)),
  reviews: 100 + i,
  isOpen: i % 2 === 0 ? "Active" : "Inactive",
  openingHours: "9:00 AM - 9:00 PM",
  features: ["Private Room", "Couples", "Parking"],
  status: i % 2 === 0 ? "Active" : "Inactive",
}));


/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "name",
    label: "Vendor Name",
    sortable: true,
  },
  {
    key: "city",
    label: "City",
    sortable: true,
  },
  {
    key: "location",
    label: "Location",
    sortable: true,
  },
  {
    key: "phone",
    label: "Phone",
  },
  {
    key: "rating",
    label: "Rating",
    sortable: true,
  },
  {
    key: "reviews",
    label: "Reviews",
    sortable: true,
  },
  {
    key: "openingHours",
    label: "Opening Hours",
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
  {
    icon: "visibility",
    label: "View Details",
    event: "__view_detail__",
  },
  {
    icon: "edit",
    label: "Edit",
    event: "edit",
  },
  {
    icon: "delete",
    label: "Delete",
    event: "delete",
    variant: "danger",
  },
]);

const DT_FILTERS = JSON.stringify([
  {
    label: "Active",
    value: "Active",
  },
  {
    label: "Inactive",
    value: "Inactive",
  },
]);

/* -------------------------------------------------------------------------- */
/*                            TABLE HOOK                                      */
/* -------------------------------------------------------------------------- */

function useCategoryTable() {
  const [params, setParams] = useState<DtParams>({
    page: 1,
    pageSize: 10,
    sortKey: "",
    sortDir: "",
    search: "",
    filter: "",
  });

  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    let data = [...ALL_VENDORS];

    if (params.search) {
      const q = params.search.toLowerCase();

      data = data.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(q)
        )
      );
    }

    if (params.filter) {
      data = data.filter((row) => row.status === params.filter);
    }

    if (params.sortKey) {
      const key = params.sortKey as keyof (typeof ALL_VENDORS)[0];

      data.sort((a, b) => {
        const cmp = String(a[key]).localeCompare(String(b[key]));
        return params.sortDir === "desc" ? -cmp : cmp;
      });
    }

    return data;
  }, [
    params.search,
    params.filter,
    params.sortKey,
    params.sortDir,
  ]);

  const pageRows = useMemo(
    () =>
      filtered.slice(
        (params.page - 1) * params.pageSize,
        params.page * params.pageSize
      ),
    [filtered, params.page, params.pageSize]
  );

  // CategoryPage.tsx (PART 2)

  const onParamsChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<DtParams>).detail;

    setLoading(true);

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

/* -------------------------------------------------------------------------- */
/*                              CATEGORY PAGE                                 */
/* -------------------------------------------------------------------------- */

export function Vendor() {
  const [open, setOpen] = useState(false);

  const dt = useCategoryTable();

  const dtRef = useRef<HTMLElement>(null);

  const handleSave = (data: any) => {
    console.log("Category Saved :", data);
    setOpen(false);
  };

  useEffect(() => {
    const el = dtRef.current;

    if (!el) return;

    el.addEventListener(
      "sky-dt-params-change",
      dt.onParamsChange
    );

    return () =>
      el.removeEventListener(
        "sky-dt-params-change",
        dt.onParamsChange
      );
  }, [dt.onParamsChange]);

  return (
    <div className="category-page">

      {/* Header */}
      <div className="page-header">
        <h1>Vendor</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Category");
                setOpen(true);
              }}
            >
             <span className="plus-icon">+</span>
            </FilledButton>
          </div>
        )}
      </div>

      {/* FORM */}

      {open ? (
        <VendorForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* TABLE */}

          <section className="showcase__card">
            <h2>Vendor List</h2>

            <p className="demo-label">
              Vendor Management • Search • Filter • Sort • Export •
              Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef as React.RefObject<HTMLElement>}
              caption=" Vendor Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Category..."
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

export default Vendor;