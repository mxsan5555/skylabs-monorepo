import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listWebsitePages, updateWebsitePage, type WebsitePage, type WebsitePageInput } from '../../../../api/rbac/website-pages';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { formatDate } from '../../../../blog/blog';
import { LegalPageFormDialog } from './legal-page-form-dialog';

const COLUMNS = JSON.stringify([
  { key: 'Title', label: 'Title' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Published: 'success', Draft: 'error' } },
  { key: 'Updated', label: 'Updated' },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/**
 * Legal Pages admin list — the 4 fixed rows (Privacy Policy/Terms of Service/Accessibility/
 * Cookie Policy). Edit-only by design: `cms.website-pages` only ever grants `view`/`edit` (no
 * `create`/`delete` action exists for this permission at all — see msd-api's seed.ts's
 * `EXTRA_ACTIONS_BY_MENU_KEY` note), so there is deliberately no "Add" button and no delete row
 * action here, unlike every other CRUD screen in this module.
 */
export function LegalPagesList() {
  const { token, can } = useAuth();
  const { showToast } = useToast();
  const canEdit = can('cms.website-pages', 'edit');

  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [error, setError] = useState('');

  const [editingPage, setEditingPage] = useState<WebsitePage | null>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listWebsitePages(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setPages(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load legal pages.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: WebsitePageInput, existing: WebsitePage) => {
    const { data } = await updateWebsitePage(token, existing.id, input);
    setPages((prev) => prev.map((p) => (p.id === data.id ? data : p)));
    showToast('Legal page updated.');
    return data;
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        pages.map((page) => ({
          Title: page.title,
          Slug: page.slug,
          Status: page.status === 'PUBLISHED' ? 'Published' : 'Draft',
          Updated: formatDate(page.updatedAt),
        })),
      ),
    [pages],
  );

  const actions = useMemo(() => JSON.stringify(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []), [canEdit]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, search: detail.search });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; rowIndex: number }>).detail;
      const page = pages[detail.rowIndex];
      if (!page) return;
      if (detail.action === 'edit') {
        setEditingPage(page);
        editDialogRef.current?.show();
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Legal Pages · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Legal Pages</h1>
          <p>Edit the fixed legal pages shown on the public site (Privacy Policy, Terms of Service, Accessibility, Cookie Policy).</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Legal Pages"
        columns={COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by title…"
        actions={actions}
      />

      {canEdit && editingPage && (
        <LegalPageFormDialog
          key={editingPage.id}
          dialogRef={editDialogRef}
          page={editingPage}
          onSave={(input) => save(input, editingPage)}
          onClose={() => setEditingPage(null)}
        />
      )}
    </div>
  );
}

export default LegalPagesList;
