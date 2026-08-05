// CategoryPage.tsx (PART 1)

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { FilledButton } from "@skylabs-monorepo/shared-ui/react";
import { CategoryForm } from "./categoryForm";

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

const ALL_CATEGORIES = Array.from({ length: 100 }, (_, i) => ({
  category_name: `Category ${i + 1}`,
  category_slug: `category-${i + 1}`,
  icon_image: `https://picsum.photos/40?random=${i + 1}`,
  banner_image: `https://picsum.photos/200/80?random=${i + 1}`,
  description: `Description for Category ${i + 1}`,
  status: i % 2 === 0 ? "Active" : "Inactive",
  meta_title: `Meta Title ${i + 1}`,
  meta_description: `Meta Description ${i + 1}`,
}));

/* -------------------------------------------------------------------------- */
/*                             TABLE COLUMNS                                  */
/* -------------------------------------------------------------------------- */

const DT_COLUMNS = JSON.stringify([
  {
    key: "category_name",
    label: "Category Name",
    sortable: true,
  },
  {
    key: "category_slug",
    label: "Slug",
    sortable: true,
  },
  {
    key: "icon_image",
    label: "Icon",
    type: "image",
  },

  {
    key: "banner_image",
    label: "Banner",
    type: "image",
  },

  {
    key: "description",
    label: "Description",
    sortable: false,
  },
  {
    key: "meta_title",
    label: "Meta Title",
    sortable: false,
  },
  {
    key: "meta_description",
    label: "Meta Description",
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
    let data = [...ALL_CATEGORIES];

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
      const key = params.sortKey as keyof (typeof ALL_CATEGORIES)[0];

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

export function CategoryPage() {
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
        <h1>Category</h1>

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
        <CategoryForm
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          {/* TABLE */}

          <section className="showcase__card">
            <h2>Category List</h2>

            <p className="demo-label">
              Category Management • Search • Filter • Sort • Export •
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

export default CategoryPage;