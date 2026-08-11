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
  createService,
  deleteService,
  listServices,
  setServiceStatus,
  updateService,
  type Service,
  type ServiceInput,
} from '../../../../api/rbac/services';
import { listCategories, type Category } from '../../../../api/rbac/categories';
import { ApiRequestError } from '../../../../api/rbac/client';

/**
 * Marketplace service catalog admin CRUD — mirrors `ProductManagement`'s exact list +
 * Add/Edit-dialog pattern. A Service is a catalog definition only (e.g. "Haircut"); it is
 * never priced and never vendor/branch-scoped — a vendor's actual bookable offering of a
 * Service is a Deal (see the marketplace architecture plan), not a field on this page.
 */
export function ServiceManagement() {
  const { token, can } = useAuth();
  const canCreate = can('services', 'create');
  const canEdit = can('services', 'edit');
  const canDelete = can('services', 'delete');

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listServices(token, { search: search || undefined, pageSize: 100 });
      setServices(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load services.');
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listCategories(token, { pageSize: 200 }).then(({ data }) => setCategories(data)).catch(() => setCategories([]));
  }, [token]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const save = async (input: ServiceInput, existing?: Service) => {
    if (existing) {
      const { data } = await updateService(token, existing.id, input);
      setServices((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    } else {
      const { data } = await createService(token, input);
      setServices((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
    }
    setMessage('Saved.');
  };

  const toggleStatus = async (service: Service) => {
    setError('');
    try {
      const { data } = await setServiceStatus(token, service.id, !service.isActive);
      setServices((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change status.');
    }
  };

  const remove = async (service: Service) => {
    if (!window.confirm(`Delete "${service.name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteService(token, service.id);
      setServices((prev) => prev.filter((s) => s.id !== service.id));
      setTotal((t) => t - 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete service.');
    }
  };

  return (
    <div className="admin-page admin-page--wide">
      <title>Services · MSD</title>
      <header className="page-head">
        <div>
          <h1>Services</h1>
          <p>Marketplace service catalog.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && categories.length > 0 && <ServiceDialog categories={categories} onSave={(input) => save(input)} />}
        </div>
      </header>

      <OutlinedTextField label="Search by name or slug" value={search} onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)} />

      {message && <p className="field-hint" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}

      {loading ? (
        <p className="loading-state">Loading services…</p>
      ) : services.length === 0 ? (
        <p className="empty-state">No services yet. {canCreate && 'Add one to get started.'}</p>
      ) : (
        <>
          <p className="field-hint">{total} service{total === 1 ? '' : 's'}</p>
          <ul className="entity-list">
            {services.map((service) => (
              <li key={service.id}>
                <div className="entity-list__item">
                  <span className="role-list__name">
                    {service.name}
                    <span className="field-hint">
                      {' '}
                      · {categoryName(service.categoryId)}
                      {service.defaultDurationMinutes && ` · ${service.defaultDurationMinutes} min`}
                    </span>
                  </span>
                  <span className={`status-pill ${service.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
                    {service.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="page-head__actions">
                  {canEdit && <ServiceDialog categories={categories} service={service} onSave={(input) => save(input, service)} />}
                  {canEdit && (
                    <OutlinedButton onClick={() => toggleStatus(service)}>
                      {service.isActive ? 'Deactivate' : 'Activate'}
                    </OutlinedButton>
                  )}
                  {canDelete && (
                    <OutlinedButton onClick={() => remove(service)}>
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

const EMPTY_INPUT: ServiceInput = { name: '', slug: '', categoryId: '' };

function ServiceDialog({ categories, service, onSave }: { categories: Category[]; service?: Service; onSave: (input: ServiceInput) => Promise<void> }) {
  const dialogRef = useRef<MdDialog>(null);
  const [form, setForm] = useState<ServiceInput>(
    service
      ? {
          name: service.name,
          slug: service.slug,
          categoryId: service.categoryId,
          subcategoryId: service.subcategoryId ?? undefined,
          description: service.description ?? undefined,
          image: service.image ?? undefined,
          imageAlt: service.imageAlt ?? undefined,
          defaultDurationMinutes: service.defaultDurationMinutes ?? undefined,
        }
      : { ...EMPTY_INPUT, categoryId: categories.find((c) => !c.parentId)?.id ?? categories[0]?.id ?? '' },
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parentCategories = categories.filter((c) => !c.parentId);
  const subcategoryOptions = categories.filter((c) => c.parentId === form.categoryId);

  const set = <K extends keyof ServiceInput>(key: K, value: ServiceInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.categoryId) {
      setError('Name, slug, and category are required.');
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
        <Icon slot="icon" aria-hidden="true">{service ? 'edit' : 'add'}</Icon>
        {service ? 'Edit' : 'Add service'}
      </OutlinedButton>
      <Dialog ref={dialogRef}>
        <div slot="headline">{service ? 'Edit service' : 'Add service'}</div>
        <div slot="content" className="form-grid">
          <OutlinedTextField label="Name" value={form.name} onInput={(e: Event) => set('name', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="Slug" value={form.slug} onInput={(e: Event) => set('slug', (e.target as HTMLInputElement).value)} />

          <OutlinedSelect
            label="Category"
            value={form.categoryId}
            onChange={(e: Event) => { set('categoryId', (e.target as HTMLSelectElement).value); set('subcategoryId', undefined); }}
          >
            {parentCategories.map((c) => (
              <SelectOption key={c.id} value={c.id}>
                <div slot="headline">{c.name}</div>
              </SelectOption>
            ))}
          </OutlinedSelect>

          {subcategoryOptions.length > 0 && (
            <OutlinedSelect
              label="Subcategory (optional)"
              value={form.subcategoryId ?? ''}
              onChange={(e: Event) => set('subcategoryId', (e.target as HTMLSelectElement).value || undefined)}
            >
              <SelectOption value="">
                <div slot="headline">None</div>
              </SelectOption>
              {subcategoryOptions.map((c) => (
                <SelectOption key={c.id} value={c.id}>
                  <div slot="headline">{c.name}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
          )}

          <OutlinedTextField
            label="Typical duration (minutes)"
            type="number"
            value={form.defaultDurationMinutes !== undefined ? String(form.defaultDurationMinutes) : ''}
            onInput={(e: Event) => set('defaultDurationMinutes', Number((e.target as HTMLInputElement).value) || undefined)}
          />

          <OutlinedTextField label="Description" value={form.description ?? ''} onInput={(e: Event) => set('description', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="Image URL" value={form.image ?? ''} onInput={(e: Event) => set('image', (e.target as HTMLInputElement).value)} />
          <OutlinedTextField label="Image alt text" value={form.imageAlt ?? ''} onInput={(e: Event) => set('imageAlt', (e.target as HTMLInputElement).value)} />

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

export default ServiceManagement;
