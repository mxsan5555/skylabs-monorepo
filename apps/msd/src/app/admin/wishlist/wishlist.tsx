import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { WishlistForm } from "./wishlistForm";

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

const ALL_WISHLISTS = Array.from({ length: 100 }, (_, i) => ({
  customer_id: `customer-${(i % 20) + 1}`,
  service_id:
    i % 2 === 0
      ? `service-${(i % 15) + 1}`
      : "",
  product_id:
    i % 2 !== 0
      ? `product-${(i % 20) + 1}`
      : "",
}));

/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "customer_id",
    label: "Customer ID",
    sortable: true,
  },
  {
    key: "service_id",
    label: "Service ID",
    sortable: true,
  },
  {
    key: "product_id",
    label: "Product ID",
    sortable: true,
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
/*                              TABLE HOOK                                    */
/* -------------------------------------------------------------------------- */

function useWishlistTable() {
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
    let data = [...ALL_WISHLISTS];

    /* Search */
    if (params.search) {
      const q = params.search.toLowerCase();

      data = data.filter((row) =>
        Object.values(row).some((value) =>
          String(value)
            .toLowerCase()
            .includes(q)
        )
      );
    }

    /* Sorting */
    if (params.sortKey) {
      const key =
        params.sortKey as keyof (typeof ALL_WISHLISTS)[0];

      data.sort((a, b) => {
        const cmp = String(a[key]).localeCompare(
          String(b[key])
        );

        return params.sortDir === "desc"
          ? -cmp
          : cmp;
      });
    }

    return data;
  }, [
    params.search,
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
    [
      filtered,
      params.page,
      params.pageSize,
    ]
  );

  /* Data table parameter change */
  const onParamsChange = useCallback(
    (e: Event) => {
      const detail = (e as CustomEvent).detail;

      setLoading(true);

      setTimeout(() => {
        setParams(detail);
        setLoading(false);
      }, 300);
    },
    []
  );

  return {
    rows: JSON.stringify(pageRows),
    total: filtered.length,
    loading,
    onParamsChange,
  };
}

/* -------------------------------------------------------------------------- */
/*                            WISHLIST PAGE                                   */
/* -------------------------------------------------------------------------- */

export function WishlistPage() {
  const [open, setOpen] = useState(false);

  const dt = useWishlistTable();

  const dtRef =
    useRef<HTMLElement | null>(null);

  const handleSave = (data: any) => {
    console.log("Wishlist Saved :", data);

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
    <div className="wishlist-page">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="page-header">
        <h1>Wishlist</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Wishlist");
                setOpen(true);
              }}
            >
              <span className="plus-icon">
                +
              </span>
            </FilledButton>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* FORM                                                             */}
      {/* ---------------------------------------------------------------- */}

      {open ? (
        <WishlistForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* TABLE                                                        */}
          {/* ------------------------------------------------------------ */}

          <section className="showcase__card">

            <h2>Wishlist List</h2>

            <p className="demo-label">
              Wishlist Management • Search • Sort •
              Export • Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef}
              caption="Wishlist Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Wishlist..."
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

export default WishlistPage;
