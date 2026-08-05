// CategoryPage.tsx (PART 1)

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import {DealsForm } from "./dealsForm";

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

const ALL_DEALS = Array.from({ length: 100 }, (_, i) => ({
  slug: `deal-${i + 1}`,
  title: `Spa Deal ${i + 1}`,
  providerId: `vendor-${(i % 10) + 1}`,
  providerName: `Vendor ${(i % 10) + 1}`,
  categorySlug: ["massage", "spa", "salon", "wellness"][i % 4],
  subcategorySlug: ["thai", "swedish", "deep-tissue", "hair-spa"][i % 4],
  description: `Premium wellness deal ${i + 1}`,
  image: `https://picsum.photos/200?random=${i + 1}`,
  imageAlt: `Deal ${i + 1}`,
  gallery: [
    `https://picsum.photos/400/300?random=${i + 1}`,
    `https://picsum.photos/400/300?random=${i + 101}`,
    `https://picsum.photos/400/300?random=${i + 201}`,
  ],
  options: [
    {
      name: "60 Minutes",
      price: 999,
      discountedPrice: 799,
    },
    {
      name: "90 Minutes",
      price: 1499,
      discountedPrice: 1199,
    },
  ],
  features: ["AC Room", "Certified Staff", "Free Parking"],
  howToUse: [
    "Book online",
    "Show booking confirmation",
    "Enjoy your service",
  ],
  rating: Number((4 + (i % 10) / 10).toFixed(1)),
  reviews: 100 + i,
  distance: Number((1 + (i % 15) * 0.7).toFixed(1)),
  location: [
    "Koramangala, Bangalore",
    "Connaught Place, Delhi",
    "Andheri, Mumbai",
    "Banjara Hills, Hyderabad",
  ][i % 4],
  isOpen: i % 2 === 0 ? "Active" : "Inactive",
  tags: ["Best Seller", "Trending"],
  badge: i % 3 === 0 ? "30% OFF" : "Deal of the Day",
  status: i % 2 === 0 ? "Active" : "Inactive",
}));


/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "title",
    label: "Deal Title",
    sortable: true,
  },
  {
    key: "providerName",
    label: "Vendor",
    sortable: true,
  },
  {
    key: "categorySlug",
    label: "Category",
    sortable: true,
  },
  {
    key: "subcategorySlug",
    label: "Sub Category",
    sortable: true,
  },
  {
    key: "location",
    label: "Location",
    sortable: true,
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
    key: "badge",
    label: "Badge",
    sortable: false,
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
  {
    key: "isOpen",
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

function useAllDealsTable() {
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
    let data = [...ALL_DEALS];
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
      const key = params.sortKey as keyof (typeof ALL_DEALS)[0];

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

export function Deals() {
  const [open, setOpen] = useState(false);

  const dt = useAllDealsTable();

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
        <h1>Deals</h1>

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
        <DealsForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* TABLE */}

          <section className="showcase__card">
            <h2>Deal List</h2>

            <p className="demo-label">
              Deal Management • Search • Filter • Sort • Export •
              Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef as React.RefObject<HTMLElement>}
              caption="Category Master"
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

export default Deals;