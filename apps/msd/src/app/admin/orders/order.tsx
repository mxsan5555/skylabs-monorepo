import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { OrdersForm } from "./orderForm";

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

const ALL_ORDERS = Array.from({ length: 100 }, (_, i) => ({
  customer_name: `customer-${(i % 20) + 1}`,
  vendor_name: `vendor-${(i % 10) + 1}`,
  service_name: `service-${(i % 15) + 1}`,
  booking_date: "2026-08-15",
  booking_time: "10:30 AM",
  amount: `${500 + (i % 10) * 100}`,
  discount: `${50 + (i % 5) * 25}`,
  final_amount: `${450 + (i % 10) * 75}`,
  booking_status:
    i % 3 === 0
      ? "Pending"
      : i % 3 === 1
        ? "Confirmed"
        : "Completed",
  payment_status:
    i % 3 === 0
      ? "Pending"
      : i % 3 === 1
        ? "Paid"
        : "Failed",
}));

/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "customer_name",
    label: "Customer Name",
    sortable: true,
  },
  {
    key: "vendor_name",
    label: "Vendor Name",
    sortable: true,
  },
  {
    key: "service_name",
    label: "Service Name",
    sortable: true,
  },
  {
    key: "booking_date",
    label: "Booking Date",
    sortable: true,
  },
  {
    key: "booking_time",
    label: "Booking Time",
    sortable: true,
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
  },
  {
    key: "discount",
    label: "Discount",
    sortable: true,
  },
  {
    key: "final_amount",
    label: "Final Amount",
    sortable: true,
  },
  {
    key: "booking_status",
    label: "Booking Status",
    type: "status",
    statusMap: {
      Pending: "warning",
      Confirmed: "success",
      Completed: "success",
      Cancelled: "error",
    },
  },
  {
    key: "payment_status",
    label: "Payment Status",
    type: "status",
    statusMap: {
      Pending: "warning",
      Paid: "success",
      Failed: "error",
      Refunded: "error",
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
    label: "Pending",
    value: "Pending",
  },
  {
    label: "Confirmed",
    value: "Confirmed",
  },
  {
    label: "Completed",
    value: "Completed",
  },
  {
    label: "Cancelled",
    value: "Cancelled",
  },
]);

/* -------------------------------------------------------------------------- */
/*                              TABLE HOOK                                    */
/* -------------------------------------------------------------------------- */

function useOrdersTable() {
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
    let data = [...ALL_ORDERS];

    /* Search */
    if (params.search) {
      const q = params.search.toLowerCase();

      data = data.filter((row) =>
        Object.values(row).some((value) =>
          String(value).toLowerCase().includes(q)
        )
      );
    }

    /* Booking Status Filter */
    if (params.filter) {
      data = data.filter(
        (row) => row.booking_status === params.filter
      );
    }

    /* Sorting */
    if (params.sortKey) {
      const key =
        params.sortKey as keyof (typeof ALL_ORDERS)[0];

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
/*                              ORDERS PAGE                                   */
/* -------------------------------------------------------------------------- */

export function OrdersPage() {
  const [open, setOpen] = useState(false);

  const dt = useOrdersTable();

  const dtRef = useRef<HTMLElement | null>(null);

  const handleSave = (data: any) => {
    console.log("Order Saved :", data);

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
    <div className="orders-page">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="page-header">
        <h1>Orders</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Order");
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
        <OrdersForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* TABLE                                                        */}
          {/* ------------------------------------------------------------ */}

          <section className="showcase__card">
            <h2>Orders List</h2>

            <p className="demo-label">
              Order Management • Search • Filter • Sort •
              Export • Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef}
              caption="Orders Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Order..."
              filter-label="Filter by Booking Status"
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

export default OrdersPage;
