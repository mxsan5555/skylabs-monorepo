import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { CustomerForm } from "./customerForm";

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

const ALL_CUSTOMERS = Array.from({ length: 100 }, (_, i) => ({
  firstName: `FirstName ${i + 1}`,
  lastName: `LastName ${i + 1}`,
  email: `customer${i + 1}@example.com`,
  phone: `98765432${String(i).padStart(2, "0")}`,
  gender: i % 2 === 0 ? "Male" : "Female",
  dob: `199${i % 10}-01-15`,
  profileImage: `https://i.pravatar.cc/100?img=${(i % 70) + 1}`,
  status: i % 2 === 0 ? "Active" : "Inactive",
}));

/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "firstName",
    label: "First Name",
    sortable: true,
  },
  {
    key: "lastName",
    label: "Last Name",
    sortable: true,
  },
  {
    key: "email",
    label: "Email",
    sortable: true,
  },
  {
    key: "phone",
    label: "Phone",
    sortable: true,
  },
  {
    key: "gender",
    label: "Gender",
    sortable: true,
  },
  {
    key: "dob",
    label: "Date of Birth",
    sortable: true,
  },
  {
    key: "profileImage",
    label: "Profile Image",
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

function useCustomerTable() {
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
    let data = [...ALL_CUSTOMERS];

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
        params.sortKey as keyof (typeof ALL_CUSTOMERS)[0];

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
/*                              CUSTOMER PAGE                                 */
/* -------------------------------------------------------------------------- */

export function CustomerPage() {
  const [open, setOpen] = useState(false);

  const dt = useCustomerTable();

  const dtRef = useRef<HTMLElement | null>(null);

  const handleSave = (data: any) => {
    console.log("Customer Saved :", data);

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
    <div className="customer-page">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="page-header">
        <h1>Customer</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Customer");
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
        <CustomerForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* TABLE                                                        */}
          {/* ------------------------------------------------------------ */}

          <section className="showcase__card">
            <h2>Customer List</h2>

            <p className="demo-label">
              Customer Management • Search • Filter • Sort •
              Export • Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef}
              caption="Customer Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Customer..."
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

export default CustomerPage;
