import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FilledButton } from '@skylabs-monorepo/shared-ui/react';
import { SubCategoryForm } from './subCategoryForm';

interface DtParams {
    page: number;
    pageSize: number;
    sortKey: string;
    sortDir: 'asc' | 'desc' | '';
    search: string;
    filter: string;
}

const SERVICES = [
    'Thai Bliss',
    'Deep Tissue',
    'Swedish Relax',
    'Hot Stone',
    'Aromatherapy',
];
const LOCATIONS = ['Philadelphia', 'New York', 'Boston', 'Chicago', 'Miami'];
const STATUSES = ['Active', 'Pending', 'Expired'] as const;
const DURATIONS = ['60 min', '90 min', '120 min'];

const ALL_SUB_CATEGORIES = Array.from({ length: 100 }, (_, i) => ({
  category_id: (i % 10) + 1,
  subcategory_name: `Sub Category ${i + 1}`,
  subcategory_slug: `sub-category-${i + 1}`,
  icon_image: `https://picsum.photos/40?random=${i + 1}`,
  description: `Description for Sub Category ${i + 1}`,
  status: i % 2 === 0 ? "Active" : "Inactive",
}));


const DT_COLUMNS = JSON.stringify([
  {
    key: "category_id",
    label: "Category ID/Name",
    sortable: true,
    width: "130px",
  },
  {
    key: "subcategory_name",
    label: "Sub Category Name",
    sortable: true,
  },
  {
    key: "subcategory_slug",
    label: "Sub Category Slug",
    sortable: true,
  },
  {
    key: "icon_image",
    label: "Icon Image",
  },
  {
    key: "description",
    label: "Description",
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
    { icon: 'visibility', label: 'View details', event: '__view_detail__' },
    { icon: 'edit', label: 'Edit', event: 'edit' },
    { icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' },
]);

const DT_FILTERS = JSON.stringify([
    { label: 'Active', value: 'Active' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Expired', value: 'Expired' },
]);


function useSubCategoryTable() {
    const [params, setParams] = useState<DtParams>({
        page: 1,
        pageSize: 10,
        sortKey: '',
        sortDir: '',
        search: '',
        filter: '',
    });
    const [loading, setLoading] = useState(false);

    const filtered = useMemo(() => {
       let data = [...ALL_SUB_CATEGORIES];
        if (params.search) {
            const q = params.search.toLowerCase();
            data = data.filter((r) =>
                Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
            );
        }
        if (params.filter) data = data.filter((r) => r.status === params.filter);
        if (params.sortKey) {
           const key = params.sortKey as keyof (typeof ALL_SUB_CATEGORIES)[0];
            data.sort((a, b) => {
                const cmp = String(a[key]).localeCompare(String(b[key]));
                return params.sortDir === 'desc' ? -cmp : cmp;
            });
        }
        return data;
    }, [params.search, params.filter, params.sortKey, params.sortDir]);

    const pageRows = useMemo(
        () =>
            filtered.slice(
                (params.page - 1) * params.pageSize,
                params.page * params.pageSize,
            ),
        [filtered, params.page, params.pageSize],
    );

    const onParamsChange = useCallback((e: Event) => {
        const detail = (e as CustomEvent<DtParams>).detail;
        setLoading(true);
        // Simulate 300 ms network round-trip so the preloader is visible.
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

// Object-param configs for demos 8 and 9 (see useSwiperParams above).
// const PAGINATION_DYNAMIC = {
//   loop: true,
//   pagination: { dynamicBullets: true },
// };
// const PAGINATION_FRACTION = {
//   navigation: true,
//   pagination: { type: 'fraction' },
// };

export function SubCategoryPage() {
    const [open, setOpen] = useState(false);
    // const dynamicRef = useSwiperParams(PAGINATION_DYNAMIC);
    //   const fractionRef = useSwiperParams(PAGINATION_FRACTION);

    const dt = useSubCategoryTable();
    const dtRef = useRef<HTMLElement>(null);

    const handleSave = (data: any) => {
        console.log(data);
        setOpen(false);
    };

    useEffect(() => {
        const el = dtRef.current;
        if (!el) return;
        el.addEventListener('sky-dt-params-change', dt.onParamsChange);
        return () =>
            el.removeEventListener('sky-dt-params-change', dt.onParamsChange);
    }, [dt.onParamsChange]);

    return (
        <div className="category-page">
            {/* Header */}
            <div className="page-header">
                <h1>Sub Category</h1>

                {!open && (
                    <div className="add-btn">
                        <FilledButton onClick={() => setOpen(true)}>
                            <span className="plus-icon">+</span>
                        </FilledButton>
                    </div>
                )}
            </div>

            {/* FORM */}
            {open ? (
                <SubCategoryForm onSave={handleSave} onClose={() => setOpen(false)} />
            ) : (
                <>
                    {/* TABLE */}
                    <section className="showcase__card">
                      <h2>Sub Category List</h2>
                        <p className="demo-label">
                            100 records · lazy loading · search · filter · sort · PDF export ·
                            row selection · view / / delete actions · detail drawer
                        </p>
                        {/* sky-data-table is a raw LIT web component — events are wired via
                                dtRef + addEventListener in useEffect above. */}
                        <sky-data-table
                            ref={dtRef as React.RefObject<HTMLElement>}
                           caption="Sub Category Master"
                            columns={DT_COLUMNS}
                            rows={dt.rows}
                            total={dt.total}
                            loading={dt.loading}
                            page-size={10}
                            searchable
                           search-placeholder="Search Sub Category..."
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