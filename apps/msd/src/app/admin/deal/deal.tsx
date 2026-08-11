import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { DealForm } from "./dealForm"

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
  vendor_name: `vendor-${(i % 10) + 1}`,
  title: `Special Deal ${i + 1}`,
  description: `Description for Special Deal ${i + 1}`,
  discount_type: i % 2 === 0 ? "Percentage" : "Flat",
  discount_value: i % 2 === 0 ? `${10 + (i % 5) * 5}%` : `${100 + (i % 5) * 50}`,
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  max_usage: `${50 + i}`,
  status: i % 2 === 0 ? "Active" : "Inactive",
}));

/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "vendor_name",
    label: "Vendor Name",
    sortable: true,
  },
  {
    key: "title",
    label: "Title",
    sortable: true,
  },
  {
    key: "description",
    label: "Description",
    sortable: false,
  },
  {
    key: "discount_type",
    label: "Discount Type",
    sortable: true,
  },
  {
    key: "discount_value",
    label: "Discount Value",
    sortable: true,
  },
  {
    key: "start_date",
    label: "Start Date",
    sortable: true,
  },
  {
    key: "end_date",
    label: "End Date",
    sortable: true,
  },
  {
    key: "max_usage",
    label: "Max Usage",
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

/* -------------------------------------------------------------------------- */
/*                              TABLE ACTIONS                                 */
/* -------------------------------------------------------------------------- */

const DT_ACTIONS = JSON.stringify([
  {
    icon: "visibility",
    label: "View Details",
    event: "view_detail",
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

/* -------------------------------------------------------------------------- */
/*                               TABLE FILTERS                                */
/* -------------------------------------------------------------------------- */

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
/*                              TABLE HOOK                                    */
/* -------------------------------------------------------------------------- */

function useDealTable() {
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

    /* Search */
    if (params.search) {
      const q = params.search.toLowerCase();

      data = data.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(q)
        )
      );
    }

    /* Status Filter */
    if (params.filter) {
      data = data.filter((row) => row.status === params.filter);
    }

    /* Sorting */
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

  /* Pagination */
  const pageRows = useMemo(
    () =>
      filtered.slice(
        (params.page - 1) * params.pageSize,
        params.page * params.pageSize
      ),
    [filtered, params.page, params.pageSize]
  );

  /* Data table parameter change */
  const onParamsChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;

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
/*                                DEAL PAGE                                   */
/* -------------------------------------------------------------------------- */

export function DealPage() {
  const [open, setOpen] = useState(false);

  const dt = useDealTable();

  const dtRef = useRef<HTMLElement | null>(null);

  const handleSave = (data: any) => {
    console.log("Deal Saved :", data);

    setOpen(false);
  };

  /* ---------------------------------------------------------------------- */
  /*                         DATA TABLE EVENT                                */
  /* ---------------------------------------------------------------------- */

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
    <div className="deal-page">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="page-header">
        <h1>Deal</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Deal");
                setOpen(true);
              }}
            >
              <span className="plus-icon">+</span>
            </FilledButton>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* FORM                                                             */}
      {/* ---------------------------------------------------------------- */}

      {open ? (
        <DealForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* TABLE                                                        */}
          {/* ------------------------------------------------------------ */}

          <section className="showcase__card">
            <h2>Deal List</h2>

            <p className="demo-label">
              Deal Management • Search • Filter • Sort • Export •
              Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef}
              caption="Deal Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Deal..."
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

export default DealPage;

