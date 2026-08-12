import { useCallback, useEffect, useRef, useState } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import {
  Dialog,
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  OutlinedSelect,
  SelectOption,
  TextButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  createCategory,
  deleteCategory,
  listCategories,
  setCategoryStatus,
  updateCategory,
  type Category,
  type CategoryInput,
} from '../../../../api/rbac/categories';
import { ApiRequestError } from '../../../../api/rbac/client';

interface CategoryManagementProps {
  /** 'top' → the Categories page (parentId: null rows); 'sub' → Sub Categories (parentId: set). */
  scope: 'top' | 'sub';
}

/**
 * Categories AND Sub Categories share this one component/page — same underlying Category
 * table (a row with a parentId IS a subcategory), just a different `scope` filter and,
 * for `scope="sub"`, a Parent Category selector in the Add/Edit dialog.
 */
export function CategoryManagement({ scope }: CategoryManagementProps) {
  const { token, can } = useAuth();
  const canCreate = can('masters.categories', 'create');
  const canEdit = can('masters.categories', 'edit');
  const canDelete = can('masters.categories', 'delete');

  const [categories, setCategories] = useState<Category[]>([]);
  const [parentOptions, setParentOptions] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const title = scope === 'top' ? 'Categories' : 'Sub Categories';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listCategories(token, { scope, search: search || undefined, pageSize: 100 });
      setCategories(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : `Could not load ${title.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }, [token, scope, search, title]);

  useEffect(() => {
    load();
  }, [load]);

  // Sub Categories needs the top-level list too, to populate the Parent Category selector.
  useEffect(() => {
    if (scope !== 'sub') return;
    listCategories(token, { scope: 'top', pageSize: 200 })
      .then(({ data }) => setParentOptions(data))
      .catch(() => setParentOptions([]));
  }, [token, scope]);

  const save = async (input: CategoryInput, existing?: Category) => {
    if (existing) {
      const { data } = await updateCategory(token, existing.id, input);
      setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    } else {
      const { data } = await createCategory(token, input);
      setCategories((prev) => [...prev, data]);
      setTotal((t) => t + 1);
    }
    setMessage('Saved.');
  };

  const toggleStatus = async (category: Category) => {
    setError('');
    try {
      const { data } = await setCategoryStatus(token, category.id, !category.isActive);
      setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (category: Category) => {
    if (!window.confirm(`Delete "${category.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteCategory(token, category.id);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete — it may still have subcategories or deals attached.');
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>{title} · MSD</title>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{scope === 'top' ? 'Top-level marketplace categories.' : 'Subcategories, grouped under a parent category.'}</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <CategoryDialog scope={scope} parentOptions={parentOptions} onSave={(input) => save(input)} />
          )}
        </div>
      </header>

      <OutlinedTextField
        label="Search"
        value={search}
        onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
      />

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading {title.toLowerCase()}…</p>
      ) : categories.length === 0 ? (
        <p className="empty-state">No {title.toLowerCase()} yet. {canCreate && 'Add one to get started.'}</p>
      ) : (
        <>
          <p className="field-hint">{total} {title.toLowerCase()}</p>
          <ul className="entity-list">
            {categories.map((category) => (
              <li key={category.id}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    {category.name}
                    <span className="field-hint">
                      {' '}
                      · {category.slug}
                      {scope === 'sub' && category.parent && ` · under ${category.parent.name}`}
                      {category._count && ` · ${category._count.children} subcategor${category._count.children === 1 ? 'y' : 'ies'}`}
                    </span>
                  </span>
                  <span className={`status-pill ${category.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                    {category.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="page-head__actions">
                  {canEdit && (
                    <CategoryDialog scope={scope} parentOptions={parentOptions} category={category} onSave={(input) => save(input, category)} />
                  )}
                  {canEdit && (
                    <OutlinedButton onClick={() => toggleStatus(category)}>
                      {category.isActive ? 'Deactivate' : 'Activate'}
                    </OutlinedButton>
                  )}
                  {canDelete && (
                    <OutlinedButton onClick={() => remove(category)}>
                      <Icon slot="icon" aria-hidden="true">delete</Icon>
                      Delete
                    </OutlinedButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CategoryDialog({
  scope,
  parentOptions,
  category,
  onSave,
}: {
  scope: 'top' | 'sub';
  parentOptions: Category[];
  category?: Category;
  onSave: (input: CategoryInput) => Promise<void>;
}) {
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState<CategoryInput>({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    parentId: category?.parentId ?? (scope === 'sub' ? parentOptions[0]?.id : undefined),
    sortOrder: category?.sortOrder ?? 0,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Name and slug are required.');
      return;
    }
    if (scope === 'sub' && !form.parentId) {
      setError('Select a parent category.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <OutlinedButton onClick={() => dialogRef.current?.show()}>
        <Icon slot="icon" aria-hidden="true">{category ? 'edit' : 'add'}</Icon>
        {category ? 'Edit' : scope === 'top' ? 'Add category' : 'Add subcategory'}
      </OutlinedButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">{category ? 'Edit' : scope === 'top' ? 'Add category' : 'Add subcategory'}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => setForm((f) => ({ ...f, name: (e.target as HTMLInputElement).value }))} />
          <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => setForm((f) => ({ ...f, slug: (e.target as HTMLInputElement).value }))} />
          <OutlinedTextField label="Description" value={form.description ?? ''} onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLInputElement).value }))} />
          {scope === 'sub' && (
            <OutlinedSelect
              label="Parent category"
              value={form.parentId ?? ''}
              onChange={(e: Event) => setForm((f) => ({ ...f, parentId: (e.target as HTMLSelectElement).value }))}
            >
              {parentOptions.map((p) => (
                <SelectOption key={p.id} value={p.id}>
                  <div slot="headline">{p.name}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
          )}
          <OutlinedTextField
            label="Sort order"
            type="number"
            value={String(form.sortOrder ?? 0)}
            onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
          />
          {error && <p className="error-state" role="alert">{error}</p>}
        </div>
        <div slot="actions">
          <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
          <FilledButton onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</FilledButton>
        </div>
      </Dialog>
    </>
  );
}

export default CategoryManagement;
