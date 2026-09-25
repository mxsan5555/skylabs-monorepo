import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  deleteFaq,
  listFaqs,
  setFaqStatus,
  updateFaq,
  createFaq,
  type Faq,
  type FaqInput,
} from '../../../../api/rbac/faqs';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { FaqFormDialog } from './faq-form-dialog';

const COLUMNS = JSON.stringify([
  { key: 'Question', label: 'Question' },
  { key: 'Answer', label: 'Answer' },
  { key: 'Display Order', label: 'Display Order' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/** A short single-line preview for the table — the full answer is only ever shown/edited in the
 *  form dialog, never truncated there. */
function excerpt(text: string, maxLength = 80): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * FAQ admin list — mirrors `blog-list.tsx`'s exact `<sky-data-table>` + add/edit-dialog +
 * `window.confirm` delete pattern, gated throughout on the single `cms.faq` menu key. Uses
 * `categories.tsx`'s Active/Inactive toggle (not blog's Publish/Unpublish) since an FAQ has no
 * draft/published concept — see the `Faq` schema doc comment in schema.prisma.
 */
export function FaqList() {
  const { token, can } = useAuth();
  const { showToast } = useToast();
  const canCreate = can('cms.faq', 'create');
  const canEdit = can('cms.faq', 'edit');
  const canDelete = can('cms.faq', 'delete');

  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [error, setError] = useState('');

  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listFaqs(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setFaqs(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load FAQs.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: FaqInput, existing?: Faq) => {
    if (existing) {
      const { data } = await updateFaq(token, existing.id, input);
      setFaqs((prev) => prev.map((f) => (f.id === data.id ? data : f)));
      showToast('FAQ updated.');
      return data;
    }
    const { data } = await createFaq(token, input);
    setFaqs((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    showToast('FAQ created.');
    return data;
  };

  const toggleStatus = async (faq: Faq) => {
    setError('');
    try {
      const { data } = await setFaqStatus(token, faq.id, !faq.isActive);
      setFaqs((prev) => prev.map((f) => (f.id === data.id ? data : f)));
      showToast(data.isActive ? 'FAQ activated.' : 'FAQ deactivated.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not change status.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const remove = async (faq: Faq) => {
    if (!window.confirm(`Delete "${excerpt(faq.question, 60)}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteFaq(token, faq.id);
      setFaqs((prev) => prev.filter((f) => f.id !== faq.id));
      setTotal((t) => t - 1);
      showToast('FAQ deleted.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not delete FAQ.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        faqs.map((faq) => ({
          Question: excerpt(faq.question),
          Answer: excerpt(faq.answer),
          'Display Order': faq.sortOrder,
          Status: faq.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [faqs],
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
      const faq = faqs[detail.rowIndex];
      if (!faq) return;
      if (detail.action === 'edit') {
        setEditingFaq(faq);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(faq);
      } else if (detail.action === 'delete') {
        remove(faq);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faqs]);

  return (
    <div className="admin-page admin-page--wide">
      <title>FAQ · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>FAQ</h1>
          <p>Manage the frequently asked questions shown on the public home page.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              New FAQ
            </OutlinedButton>
          )}
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="FAQ"
        columns={COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by question…"
        actions={actions}
      />

      {canCreate && <FaqFormDialog dialogRef={addDialogRef} onSave={(input) => save(input)} />}

      {canEdit && (
        <FaqFormDialog
          key={editingFaq?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          faq={editingFaq ?? undefined}
          onSave={(input) => save(input, editingFaq ?? undefined)}
          onClose={() => setEditingFaq(null)}
        />
      )}
    </div>
  );
}

export default FaqList;
