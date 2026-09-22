import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  deleteSocialMediaLink,
  listSocialMediaLinks,
  updateSocialMediaLink,
  createSocialMediaLink,
  type SocialMediaLink,
  type SocialMediaLinkInput,
} from '../../../../api/rbac/social-media';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { SocialMediaFormDialog } from './social-media-form-dialog';

const COLUMNS = JSON.stringify([
  { key: 'Platform', label: 'Platform' },
  { key: 'Display Name', label: 'Display Name' },
  { key: 'URL', label: 'URL' },
  { key: 'Sort Order', label: 'Sort Order' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Active: 'success', Inactive: 'error' } },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/**
 * Social Media Links admin list — mirrors `faq-list.tsx`'s exact `<sky-data-table>` +
 * add/edit-dialog + `window.confirm` delete pattern, gated throughout on the single
 * `cms.social-media` menu key. `isActive` has no separate `/status` route (see
 * `api/rbac/social-media.ts`'s doc comment) — the row toggle action just PATCHes it directly.
 */
export function SocialMediaList() {
  const { token, can } = useAuth();
  const { showToast } = useToast();
  const canCreate = can('cms.social-media', 'create');
  const canEdit = can('cms.social-media', 'edit');
  const canDelete = can('cms.social-media', 'delete');

  const [links, setLinks] = useState<SocialMediaLink[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [error, setError] = useState('');

  const [editingLink, setEditingLink] = useState<SocialMediaLink | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listSocialMediaLinks(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setLinks(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load social media links.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: SocialMediaLinkInput, existing?: SocialMediaLink) => {
    if (existing) {
      const { data } = await updateSocialMediaLink(token, existing.id, input);
      setLinks((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      showToast('Social media link updated.');
      return data;
    }
    const { data } = await createSocialMediaLink(token, input);
    setLinks((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    showToast('Social media link created.');
    return data;
  };

  const toggleStatus = async (link: SocialMediaLink) => {
    setError('');
    try {
      const { data } = await updateSocialMediaLink(token, link.id, { isActive: !link.isActive });
      setLinks((prev) => prev.map((l) => (l.id === data.id ? data : l)));
      showToast(data.isActive ? 'Link activated.' : 'Link deactivated.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not change status.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const remove = async (link: SocialMediaLink) => {
    if (!window.confirm(`Delete "${link.displayName}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteSocialMediaLink(token, link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      setTotal((t) => t - 1);
      showToast('Social media link deleted.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not delete social media link.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        links.map((link) => ({
          Platform: link.platform,
          'Display Name': link.displayName,
          URL: link.url,
          'Sort Order': link.sortOrder,
          Status: link.isActive ? 'Active' : 'Inactive',
        })),
      ),
    [links],
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
      const link = links[detail.rowIndex];
      if (!link) return;
      if (detail.action === 'edit') {
        setEditingLink(link);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(link);
      } else if (detail.action === 'delete') {
        remove(link);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Social Media · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Social Media</h1>
          <p>Manage the social links shown in the public site footer.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              New social link
            </OutlinedButton>
          )}
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Social Media"
        columns={COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        searchable
        search-placeholder="Search by display name…"
        actions={actions}
      />

      {canCreate && <SocialMediaFormDialog dialogRef={addDialogRef} onSave={(input) => save(input)} />}

      {canEdit && (
        <SocialMediaFormDialog
          key={editingLink?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          link={editingLink ?? undefined}
          onSave={(input) => save(input, editingLink ?? undefined)}
          onClose={() => setEditingLink(null)}
        />
      )}
    </div>
  );
}

export default SocialMediaList;
