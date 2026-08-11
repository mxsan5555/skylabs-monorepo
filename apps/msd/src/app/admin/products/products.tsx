import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { ProductsForm } from "./productsForm";

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

const ALL_PRODUCTS = Array.from({ length: 100 }, (_, i) => ({
  vendor_id: `vendor-${(i % 10) + 1}`,
  category_id: `category-${(i % 8) + 1}`,
  name: `Product ${i + 1}`,
  description: `Description for Product ${i + 1}`,
  price: `${500 + (i % 10) * 100}`,
  discount_price:
    i % 2 === 0
      ? `${400 + (i % 10) * 80}`
      : "",
  stock: `${10 + (i % 50)}`,
  sku: `SKU-${String(i + 1).padStart(5, "0")}`,
  images: `https://picsum.photos/80/80?random=${i + 1}`,
  status: i % 2 === 0 ? "Active" : "Inactive",
}));

/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "vendor_id",
    label: "Vendor ID",
    sortable: true,
  },
  {
    key: "category_id",
    label: "Category ID",
    sortable: true,
  },
  {
    key: "name",
    label: "Product Name",
    sortable: true,
  },
  {
    key: "description",
    label: "Description",
    sortable: false,
  },
  {
    key: "price",
    label: "Price",
    sortable: true,
  },
  {
    key: "discount_price",
    label: "Discount Price",
    sortable: true,
  },
  {
    key: "stock",
    label: "Stock",
    sortable: true,
  },
  {
    key: "sku",
    label: "SKU",
    sortable: true,
  },
  {
    key: "images",
    label: "Image",
    type: "image",
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

function useProductsTable() {
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
    let data = [...ALL_PRODUCTS];

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
      data = data.filter(
        (row) => row.status === params.filter
      );
    }

    /* Sorting */
    if (params.sortKey) {
      const key =
        params.sortKey as keyof (typeof ALL_PRODUCTS)[0];

      data.sort((a, b) => {
        const cmp = String(a[key]).localeCompare(
          String(b[key])
        );

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
/*                             PRODUCTS PAGE                                  */
/* -------------------------------------------------------------------------- */

export function ProductsPage() {
  const [open, setOpen] = useState(false);

  const dt = useProductsTable();

  const dtRef = useRef<HTMLElement | null>(null);

  const handleSave = (data: any) => {
    console.log("Product Saved :", data);

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
    <div className="products-page">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="page-header">
        <h1>Products</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Product");
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
        <ProductsForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* TABLE                                                        */}
          {/* ------------------------------------------------------------ */}

          <section className="showcase__card">
            <h2>Products List</h2>

            <p className="demo-label">
              Product Management • Search • Filter • Sort •
              Export • Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef}
              caption="Products Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Product..."
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

export default ProductsPage;
