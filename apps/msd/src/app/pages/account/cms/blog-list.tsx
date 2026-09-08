import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { useNavigate } from 'react-router-dom';
import { OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  deleteBlogPost,
  listBlogPosts,
  setBlogPostStatus,
  updateBlogPost,
  createBlogPost,
  type BlogPost,
  type BlogPostInput,
} from '../../../../api/rbac/blog-posts';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { formatDate } from '../../../../blog/blog';
import { BlogFormDialog } from './blog-form-dialog';

const COLUMNS = JSON.stringify([
  { key: 'Title', label: 'Title' },
  { key: 'Slug', label: 'Slug' },
  { key: 'Category', label: 'Category' },
  { key: 'Author', label: 'Author' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Published: 'success', Draft: 'error' } },
  { key: 'Published', label: 'Published' },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/**
 * Blog Posts admin list — mirrors `categories.tsx`'s exact `<sky-data-table>` +
 * add/edit-dialog + `window.confirm` delete pattern, gated throughout on the single `cms.blog`
 * menu key (view/create/edit/delete actions). Uses `useToast()` for every mutation's outcome,
 * the newer preferred pattern per that context's own doc comment, rather than categories.tsx's
 * older inline-`<p>` message.
 */
export function BlogList() {
  const { token, can } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canCreate = can('cms.blog', 'create');
  const canEdit = can('cms.blog', 'edit');
  const canDelete = can('cms.blog', 'delete');

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [error, setError] = useState('');

  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listBlogPosts(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setPosts(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load blog posts.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (input: BlogPostInput, existing?: BlogPost) => {
    if (existing) {
      const { data } = await updateBlogPost(token, existing.id, input);
      setPosts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      return data;
    }
    const { data } = await createBlogPost(token, input);
    setPosts((prev) => [...prev, data]);
    setTotal((t) => t + 1);
    return data;
  };

  const toggleStatus = async (post: BlogPost) => {
    setError('');
    try {
      const nextStatus = post.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
      const { data } = await setBlogPostStatus(token, post.id, nextStatus);
      setPosts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      showToast(nextStatus === 'PUBLISHED' ? 'Post published.' : 'Post unpublished.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not change status.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const remove = async (post: BlogPost) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteBlogPost(token, post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      setTotal((t) => t - 1);
      showToast('Blog post deleted.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not delete blog post.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        posts.map((post) => ({
          Title: post.title,
          Slug: post.slug,
          Category: post.categorySlug,
          Author: post.author,
          Status: post.status === 'PUBLISHED' ? 'Published' : 'Draft',
          Published: post.publishedAt ? formatDate(post.publishedAt) : '—',
        })),
      ),
    [posts],
  );

  const actions = useMemo(
    () =>
      JSON.stringify([
        { icon: 'visibility', label: 'View', event: 'view' },
        ...(canEdit ? [{ icon: 'edit', label: 'Edit', event: 'edit' }] : []),
        ...(canEdit ? [{ icon: 'publish', label: 'Publish / Unpublish', event: 'toggle-status' }] : []),
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
      const post = posts[detail.rowIndex];
      if (!post) return;
      if (detail.action === 'view') {
        navigate(`/account/cms/blog/${post.id}`);
      } else if (detail.action === 'edit') {
        setEditingPost(post);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(post);
      } else if (detail.action === 'delete') {
        remove(post);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  return (
    <div className="admin-page admin-page--wide">
      <title>Blog · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Blog</h1>
          <p>Manage articles shown on the public blog.</p>
        </div>
        <div className="page-head__actions">
          {canCreate && (
            <OutlinedButton onClick={() => addDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              New blog post
            </OutlinedButton>
          )}
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Blog"
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

      {canCreate && <BlogFormDialog dialogRef={addDialogRef} token={token} onSave={(input) => save(input)} />}

      {canEdit && (
        <BlogFormDialog
          key={editingPost?.id ?? 'edit-empty'}
          dialogRef={editDialogRef}
          post={editingPost ?? undefined}
          token={token}
          onSave={(input) => save(input, editingPost ?? undefined)}
          onClose={() => setEditingPost(null)}
        />
      )}
    </div>
  );
}

export default BlogList;
