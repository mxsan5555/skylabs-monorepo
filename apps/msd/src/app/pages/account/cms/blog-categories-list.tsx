import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  deleteBlogCategory,
  listBlogCategories,
  updateBlogCategory,
  createBlogCategory,
  type BlogCategory,
  type BlogCategoryInput,
} from '../../../../api/rbac/blog-categories';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { useConfirmDialog } from '../../../components/confirm-dialog';
import { BlogCategoryFormDialog } from './blog-category-form-dialog';

const COLUMNS = JSON.stringify([
  { key: 'Name', label: 'Name' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Description', label: 'Description' },
  { key: 'Sort Order', label: 'Sort Order' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

function excerpt(text: string, maxLength = 80): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Blog Categories admin list — mirrors `faq-list.tsx`'s exact `<sky-data-table>` +
 * add/edit-dialog + `window.confirm` delete pattern, gated throughout on the single
 * `cms.blog-category` menu key. `isActive` has no separate `/status` route (see
 * `api/rbac/blog-categories.ts`'s doc comment) — the row toggle action just PATCHes it directly.
 */
export function BlogCategoriesList() {
  const { token, can } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { showToast } = useToast();
  const canCreate = can('cms.blog-category', 'create');
  const canEdit = can('cms.blog-category', 'edit');
  const canDelete = can('cms.blog-category', 'delete');

  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [error, setError] = useState('');

  const [editingCategory, setEditingCategory] = useState<BlogCategory | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listBlogCategories(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setCategories(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load blog categories.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: BlogCategoryInput, existing?: BlogCategory) => {
    if (existing) {
      const { data } = await updateBlogCategory(token, existing.id, input);
      setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      showToast('Blog category updated.');
      return data;
    }
    const { data } = await createBlogCategory(token, input);
    setCategories((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    showToast('Blog category created.');
    return data;
  };

  const toggleStatus = async (category: BlogCategory) => {
    setError('');
    try {
      const { data } = await updateBlogCategory(token, category.id, { isActive: !category.isActive });
      setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      showToast(data.isActive ? 'Category activated.' : 'Category deactivated.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not change status.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const remove = async (category: BlogCategory) => {
    if (!(await confirm(`Delete "${category.name}"? This cannot be undone.`))) return;
    setError('');
    try {
      await deleteBlogCategory(token, category.id);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      setTotal((t) => t - 1);
      showToast('Blog category deleted.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not delete blog category.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        categories.map((category) => ({
          Name: category.name,
          Slug: category.slug,
          Description: excerpt(category.description),
          'Sort Order': category.sortOrder,
          Status: category.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [categories],
  );

  const actions = useMemo(
    () =>
      JSON.stringify([
        ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'toggle_on', label: 'Activate / Deactivate', event: 'toggle-status' }] : []),
        ...(canDelete ? [{ icon: 'delete', label: 'Delete', event: 'delete', variant: 'danger' }] : []),
      ]),
    [canEdit, canDelete],
  );

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const category = categories[detail.rowIndex];
      if (!category) return;
      if (detail.action === 'edit') {
        setEditingCategory(category);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(category);
      } else if (detail.action === 'delete') {
        remove(category);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Blog Categories · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Blog Categories</h1>
          <p>Manage the categories used to organize public blog posts.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              New category
            </OutlinedButton>
          )}
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Blog Categories"
        columns={COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by name…"
        actions={actions}
      />

      {canCreate && <BlogCategoryFormDialog dialogRef={addDialogRef} onSave={(input) => save(input)} />}

      {canEdit && (
        <BlogCategoryFormDialog
          key={editingCategory?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          category={editingCategory ?? undefined}
          onSave={(input) => save(input, editingCategory ?? undefined)}
          onClose={() => setEditingCategory(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

export default BlogCategoriesList;
