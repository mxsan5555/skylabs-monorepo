import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { FilledButton, Icon, OutlinedButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getCareersContent,
  updateCareersContent,
  listCareersJobs,
  createCareersJob,
  updateCareersJob,
  setCareersJobStatus,
  deleteCareersJob,
  type CareersPageContent,
  type CareersPageContentInput,
  type CareersJobListing,
  type CareersJobListingInput,
  type CareersJobStatus,
} from '../../../../api/rbac/careers';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { extractSiteContentFieldErrors } from './field-errors';
import { CareersJobFormDialog } from './careers-job-form-dialog';

type ContentFieldKey = keyof CareersPageContentInput;

const EMPTY_CONTENT_FORM: CareersPageContentInput = { heroTitle: '', heroSubtitle: '', metaTitle: '', metaDescription: '' };

const COLUMNS = JSON.stringify([
  { key: 'Job Title', label: 'Job Title' },
  { key: 'Department', label: 'Department' },
  { key: 'Location', label: 'Location' },
  { key: 'Employment Type', label: 'Employment Type' },
  { key: 'Status', label: 'Status', type: 'status', statusMap: { Published: 'success', Draft: 'error' } },
]);

interface TableParams {
  page: number;
  pageSize: number;
  search: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, search: '' };

/**
 * Careers admin page — an intro (hero) singleton form (same GET/PATCH shape as
 * `about-us.tsx`/`how-it-works.tsx`) plus a full-CRUD `<sky-data-table>` of job listings below it,
 * mirroring `blog-list.tsx`'s exact table + add/edit-dialog + `window.confirm` delete +
 * publish/unpublish row-action pattern. Every action is gated on the single `cms.careers` menu
 * key (view/create/edit/delete).
 */
export function CareersPage() {
  const { token, can } = useAuth();
  const { showToast } = useToast();
  const canEditContent = can('cms.careers', 'edit');
  const canCreate = can('cms.careers', 'create');
  const canEdit = can('cms.careers', 'edit');
  const canDelete = can('cms.careers', 'delete');

  // ─── Intro content ────────────────────────────────────────────────────────
  const [content, setContent] = useState<CareersPageContent | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState('');
  const [contentForm, setContentForm] = useState<CareersPageContentInput>(EMPTY_CONTENT_FORM);
  const [contentFieldErrors, setContentFieldErrors] = useState<Partial<Record<ContentFieldKey, string>> | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const contentSubmittingRef = useRef(false);

  const loadContent = useCallback(async () => {
    setContentLoading(true);
    setContentError('');
    try {
      const { data } = await getCareersContent(token);
      setContent(data);
      setContentForm({
        heroTitle: data.heroTitle,
        heroSubtitle: data.heroSubtitle,
        metaTitle: data.metaTitle ?? '',
        metaDescription: data.metaDescription ?? '',
      });
    } catch (err) {
      setContentError(err instanceof ApiRequestError ? err.message : 'Could not load Careers content.');
    } finally {
      setContentLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const submitContent = async () => {
    if (contentSubmittingRef.current) return;
    contentSubmittingRef.current = true;
    setSavingContent(true);
    setContentError('');
    setContentFieldErrors(null);
    const payload: CareersPageContentInput = {
      ...contentForm,
      metaTitle: contentForm.metaTitle?.trim() || undefined,
      metaDescription: contentForm.metaDescription?.trim() || undefined,
    };
    try {
      const { data } = await updateCareersContent(token, payload);
      setContent(data);
      showToast('Careers content saved.');
    } catch (err) {
      const fields = extractSiteContentFieldErrors<ContentFieldKey>(err);
      if (fields) {
        setContentFieldErrors(fields);
        setContentError('Fix the highlighted fields and try again.');
      } else {
        const msg = err instanceof ApiRequestError ? err.message : 'Could not save Careers content.';
        setContentError(msg);
        showToast(msg, 'error');
      }
    } finally {
      contentSubmittingRef.current = false;
      setSavingContent(false);
    }
  };

  // ─── Job listings ─────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<CareersJobListing[]>([]);
  const [total, setTotal] = useState(0);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);
  const [jobsError, setJobsError] = useState('');

  const [editingJob, setEditingJob] = useState<CareersJobListing | null>(null);
  const addDialogRef = useRef<MdDialog>(null);
  const editDialogRef = useRef<MdDialog>(null);
  const tableRef = useRef<HTMLElement>(null);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError('');
    try {
      const { data, meta } = await listCareersJobs(token, {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      });
      setJobs(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setJobsError(err instanceof ApiRequestError ? err.message : 'Could not load job listings.');
    } finally {
      setJobsLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const saveJob = async (input: CareersJobListingInput, status: CareersJobStatus, existing?: CareersJobListing) => {
    let data: CareersJobListing;
    if (existing) {
      ({ data } = await updateCareersJob(token, existing.id, input));
    } else {
      ({ data } = await createCareersJob(token, input));
    }
    // `status` isn't part of the create/update payload (see careers-job-form-dialog.tsx's own doc
    // comment) — only call the separate status route when the form's selection actually differs
    // from what the main save just returned.
    if (data.status !== status) {
      ({ data } = await setCareersJobStatus(token, data.id, status));
    }
    setJobs((prev) => (existing ? prev.map((j) => (j.id === data.id ? data : j)) : [...prev, data]));
    if (!existing) setTotal((t) => t + 1);
    showToast(existing ? 'Job listing updated.' : 'Job listing created.');
    return data;
  };

  const toggleStatus = async (job: CareersJobListing) => {
    setJobsError('');
    try {
      const nextStatus = job.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
      const { data } = await setCareersJobStatus(token, job.id, nextStatus);
      setJobs((prev) => prev.map((j) => (j.id === data.id ? data : j)));
      showToast(nextStatus === 'PUBLISHED' ? 'Job listing published.' : 'Job listing unpublished.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not change status.';
      setJobsError(msg);
      showToast(msg, 'error');
    }
  };

  const removeJob = async (job: CareersJobListing) => {
    if (!window.confirm(`Delete "${job.jobTitle}"? This cannot be undone.`)) return;
    setJobsError('');
    try {
      await deleteCareersJob(token, job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setTotal((t) => t - 1);
      showToast('Job listing deleted.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not delete job listing.';
      setJobsError(msg);
      showToast(msg, 'error');
    }
  };

  const rows = useMemo(
    () =>
      JSON.stringify(
        jobs.map((job) => ({
          'Job Title': job.jobTitle,
          Department: job.department,
          Location: job.location,
          'Employment Type': job.employmentType,
          Status: job.status === 'PUBLISHED' ? 'Published' : 'Draft',
        })),
      ),
    [jobs],
  );

  const actions = useMemo(
    () =>
      JSON.stringify([
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
      const job = jobs[detail.rowIndex];
      if (!job) return;
      if (detail.action === 'edit') {
        setEditingJob(job);
        editDialogRef.current?.show();
      } else if (detail.action === 'toggle-status') {
        toggleStatus(job);
      } else if (detail.action === 'delete') {
        removeJob(job);
      }
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  if (contentLoading) {
    return (
      <div className="admin-page admin-page--wide">
        <title>Careers · MSD</title>
        <meta name="robots" content="noindex" />
        <p className="loading-state">Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <title>Careers · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Careers</h1>
          <p>Edit the intro copy and open roles shown on the public Careers page.</p>
          {content?.updatedAt && <p className="field-hint">Last saved {new Date(content.updatedAt).toLocaleString()}</p>}
        </div>
      </header>

      <section aria-labelledby="careers-intro">
        <h2 id="careers-intro">Intro</h2>
        {contentError && <p className="error-state" role="alert">{contentError}</p>}

        <div className="form-grid">
          <OutlinedTextField
            label="Hero title"
            value={contentForm.heroTitle ?? ''}
            disabled={!canEditContent}
            onInput={(e: Event) => setContentForm((f) => ({ ...f, heroTitle: (e.target as HTMLInputElement).value }))}
          />
          {contentFieldErrors?.heroTitle && <p className="error-state" role="alert">{contentFieldErrors.heroTitle}</p>}

          <OutlinedTextField
            label="Hero subtitle"
            value={contentForm.heroSubtitle ?? ''}
            disabled={!canEditContent}
            onInput={(e: Event) => setContentForm((f) => ({ ...f, heroSubtitle: (e.target as HTMLInputElement).value }))}
          />
          {contentFieldErrors?.heroSubtitle && <p className="error-state" role="alert">{contentFieldErrors.heroSubtitle}</p>}

          <fieldset className="form-grid">
            <legend>SEO (optional)</legend>
            <OutlinedTextField
              label="Meta title"
              value={contentForm.metaTitle ?? ''}
              disabled={!canEditContent}
              onInput={(e: Event) => setContentForm((f) => ({ ...f, metaTitle: (e.target as HTMLInputElement).value }))}
            />
            {contentFieldErrors?.metaTitle && <p className="error-state" role="alert">{contentFieldErrors.metaTitle}</p>}
            <OutlinedTextField
              label="Meta description"
              type="textarea"
              rows={2}
              value={contentForm.metaDescription ?? ''}
              disabled={!canEditContent}
              onInput={(e: Event) => setContentForm((f) => ({ ...f, metaDescription: (e.target as HTMLTextAreaElement).value }))}
            />
            {contentFieldErrors?.metaDescription && <p className="error-state" role="alert">{contentFieldErrors.metaDescription}</p>}
          </fieldset>
        </div>

        {canEditContent && (
          <div className="form-actions">
            <FilledButton onClick={submitContent} disabled={savingContent}>
              <Icon slot="icon" aria-hidden="true">save</Icon>
              {savingContent ? 'Saving…' : 'Save intro'}
            </FilledButton>
          </div>
        )}
      </section>

      <section aria-labelledby="careers-jobs">
        <header className="page-head">
          <h2 id="careers-jobs">Job listings</h2>
          <div className="page-head__actions">
            {canCreate && (
              <OutlinedButton onClick={() => addDialogRef.current?.show()}>
                <Icon slot="icon" aria-hidden="true">add</Icon>
                New job listing
              </OutlinedButton>
            )}
          </div>
        </header>

        {jobsError && <p className="error-state" role="alert">{jobsError}</p>}

        <sky-data-table
          ref={tableRef as RefObject<HTMLElement>}
          caption="Job listings"
          columns={COLUMNS}
          rows={rows}
          total={total}
          page={params.page}
          page-size={params.pageSize}
          loading={jobsLoading}
          searchable
          search-placeholder="Search by job title…"
          actions={actions}
        />
      </section>

      {canCreate && <CareersJobFormDialog dialogRef={addDialogRef} onSave={(input, status) => saveJob(input, status)} />}

      {canEdit && editingJob && (
        <CareersJobFormDialog
          key={editingJob.id}
          dialogRef={editDialogRef}
          job={editingJob}
          onSave={(input, status) => saveJob(input, status, editingJob)}
          onClose={() => setEditingJob(null)}
        />
      )}
    </div>
  );
}

export default CareersPage;
