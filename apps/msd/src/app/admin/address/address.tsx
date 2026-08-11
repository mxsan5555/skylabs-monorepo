import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { AddressForm } from "./addressForm";

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

const ALL_ADDRESSES = Array.from({ length: 100 }, (_, i) => ({
  customer_id: `customer-${(i % 20) + 1}`,
  label: i % 3 === 0
    ? "Home"
    : i % 3 === 1
      ? "Work"
      : "Other",
  address_line_1: `${i + 1}, Main Street`,
  address_line_2: `Apartment ${((i % 20) + 1)}`,
  landmark: "Near Main Market",
  city: i % 2 === 0 ? "Delhi" : "Noida",
  state: "Uttar Pradesh",
  pincode: `20130${String(i % 10)}`,
  latitude: "28.6139",
  longitude: "77.2090",
  is_default: i % 3 === 0 ? "Yes" : "No",
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
    key: "label",
    label: "Label",
    sortable: true,
  },
  {
    key: "address_line_1",
    label: "Address Line 1",
    sortable: false,
  },
  {
    key: "address_line_2",
    label: "Address Line 2",
    sortable: false,
  },
  {
    key: "landmark",
    label: "Landmark",
    sortable: false,
  },
  {
    key: "city",
    label: "City",
    sortable: true,
  },
  {
    key: "state",
    label: "State",
    sortable: true,
  },
  {
    key: "pincode",
    label: "Pincode",
    sortable: true,
  },
  {
    key: "latitude",
    label: "Latitude",
    sortable: true,
  },
  {
    key: "longitude",
    label: "Longitude",
    sortable: true,
  },
  {
    key: "is_default",
    label: "Default",
    type: "status",
    statusMap: {
      Yes: "success",
      No: "error",
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
    label: "Default",
    value: "Yes",
  },
  {
    label: "Non Default",
    value: "No",
  },
]);

/* -------------------------------------------------------------------------- */
/*                              TABLE HOOK                                    */
/* -------------------------------------------------------------------------- */

function useAddressTable() {
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
    let data = [...ALL_ADDRESSES];

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

    /* Default Address Filter */
    if (params.filter) {
      data = data.filter(
        (row) => row.is_default === params.filter
      );
    }

    /* Sorting */
    if (params.sortKey) {
      const key =
        params.sortKey as keyof (typeof ALL_ADDRESSES)[0];

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
/*                              ADDRESS PAGE                                  */
/* -------------------------------------------------------------------------- */

export function AddressPage() {
  const [open, setOpen] = useState(false);

  const dt = useAddressTable();

  const dtRef =
    useRef<HTMLElement | null>(null);

  const handleSave = (data: any) => {
    console.log("Address Saved :", data);

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
    <div className="address-page">

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                           */}
      {/* ---------------------------------------------------------------- */}

      <div className="page-header">
        <h1>Address</h1>

        {!open && (
          <div className="add-btn">
            <FilledButton
              onClick={() => {
                console.log("Add Address");
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
        <AddressForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ */}
          {/* TABLE                                                        */}
          {/* ------------------------------------------------------------ */}

          <section className="showcase__card">

            <h2>Address List</h2>

            <p className="demo-label">
              Address Management • Search • Filter • Sort •
              Export • Selection • View • Edit • Delete
            </p>

            <sky-data-table
              ref={dtRef}
              caption="Address Master"
              columns={DT_COLUMNS}
              rows={dt.rows}
              total={dt.total}
              loading={dt.loading}
              page-size={10}
              searchable
              search-placeholder="Search Address..."
              filter-label="Filter by Default"
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

export default AddressPage;
