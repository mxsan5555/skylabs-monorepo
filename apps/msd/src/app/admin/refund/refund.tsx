import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { RefundForm } from "./refundForm";

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

const ALL_REFUNDS = Array.from({ length: 100 }, (_, i) => ({
  payment_id: `payment-${(i % 30) + 1}`,
  booking_id: `booking-${(i % 40) + 1}`,
  customer_id: `customer-${(i % 20) + 1}`,
  refund_amount: `${500 + (i % 10) * 100}`,
  refund_reason:
    i % 3 === 0
      ? "Customer requested cancellation"
      : i % 3 === 1
        ? "Service unavailable"
        : "Duplicate payment",
  refund_method:
    i % 2 === 0
      ? "Original Payment Method"
      : "Bank Transfer",
  transaction_id:
    i % 2 === 0
      ? `TXN-${String(i + 1).padStart(6, "0")}`
      : "",
  refund_status:
    i % 3 === 0
      ? "Pending"
      : i % 3 === 1
        ? "Processed"
        : "Rejected",
  refunded_at:
    i % 3 === 1
      ? "2026-08-10 12:30 PM"
      : "",
  created_at: "2026-08-08 10:00 AM",
}));

/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "payment_id",
    label: "Payment ID",
    sortable: true,
  },
  {
    key: "booking_id",
    label: "Booking ID",
    sortable: true,
  },
  {
    key: "customer_id",
    label: "Customer ID",
    sortable: true,
  },
  {
    key: "refund_amount",
    label: "Refund Amount",
    sortable: true,
  },
  {
    key: "refund_reason",
    label: "Refund Reason",
    sortable: false,
  },
  {
    key: "refund_method",
    label: "Refund Method",
    sortable: true,
  },
  {
    key: "transaction_id",
    label: "Transaction ID",
    sortable: true,
  },
  {
    key: "refund_status",
    label: "Refund Status",
    type: "status",
    statusMap: {
      Pending: "warning",
      Processed: "success",
      Rejected: "error",
    },
  },
  {
    key: "refunded_at",
    label: "Refunded At",
    sortable: true,
  },
  {
    key: "created_at",
    label: "Created At",
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
/*                               TABLE FILTERS                                */
/* -------------------------------------------------------------------------- */

const DT_FILTERS = JSON.stringify([
  {
    label: "Pending",
    value: "Pending",
  },
  {
    label: "Processed",
    value: "Processed",
  },
  {
    label: "Rejected",
    value: "Rejected",
  },
]);

/* -------------------------------------------------------------------------- */
/*                              TABLE HOOK                                    */
/* -------------------------------------------------------------------------- */

function useRefundTable() {
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
    let data = [...ALL_REFUNDS];

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

    /* Refund Status Filter */
    if (params.filter) {
      data = data.filter(
        (row) => row.refund_status === params.filter
      );
    }

    /* Sorting */
    if (params.sortKey) {
      const key =
        params.sortKey as keyof (typeof ALL_REFUNDS)[0];

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
/*                              REFUND PAGE                                   */
/* -------------------------------------------------------------------------- */

export function RefundPage() {
  const [open, setOpen] = useState(false);

  const dt = useRefundTable();

  const dtRef =
    useRef<HTMLElement | null>(null);

  const handleSave = (data: any) => {
    console.log("Refund Saved :", data);

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
    <div className="refund-page">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="page-header">
        <h1>Refund</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Refund");
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
        <RefundForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* TABLE                                                        */}
          {/* ------------------------------------------------------------ */}

          <section className="showcase__card">

            <h2>Refund List</h2>

            <p className="demo-label">
              Refund Management • Search • Filter • Sort •
              Export • Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef}
              caption="Refund Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Refund..."
              filter-label="Filter by Refund Status"
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

export default RefundPage;

