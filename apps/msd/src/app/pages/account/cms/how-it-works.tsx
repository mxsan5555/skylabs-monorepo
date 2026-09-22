import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, Icon, OutlinedButton, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getHowItWorksContent,
  updateHowItWorksContent,
  listHowItWorksSteps,
  createHowItWorksStep,
  updateHowItWorksStep,
  deleteHowItWorksStep,
  reorderHowItWorksSteps,
  type HowItWorksContent,
  type HowItWorksContentInput,
  type HowItWorksStep,
  type HowItWorksStepInput,
} from '../../../../api/rbac/how-it-works';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { extractHowItWorksStepFieldErrors, extractSiteContentFieldErrors, type HowItWorksStepFieldKey } from './field-errors';

type ContentFieldKey = keyof HowItWorksContentInput;

const EMPTY_CONTENT_FORM: HowItWorksContentInput = { heroTitle: '', heroSubtitle: '', metaTitle: '', metaDescription: '' };

/** Create/edit dialog for one How It Works step — same `submittingRef` double-submit guard +
 *  per-field-error shape as `faq-form-dialog.tsx`. `icon` is a plain text input for a Material
 *  Symbol name (rendered client-side via `<md-icon>`, matching msd-api's own schema doc comment
 *  on `HowItWorksStep.icon`) — there is no icon picker anywhere in this app to reuse. */
function StepFormDialog({
  dialogRef,
  step,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  step?: HowItWorksStep;
  onSave: (input: HowItWorksStepInput) => Promise<HowItWorksStep | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<HowItWorksStepInput>({
    title: step?.title ?? '',
    description: step?.description ?? '',
    icon: step?.icon ?? '',
    sortOrder: step?.sortOrder ?? 0,
    isActive: step?.isActive ?? true,
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<HowItWorksStepFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    setFieldErrors(null);
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    try {
      await onSave({ ...form, icon: form.icon?.trim() || undefined });
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractHowItWorksStepFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save step.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{step ? 'Edit step' : 'New step'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Title"
          value={form.title}
          onInput={(e: Event) => setForm((f) => ({ ...f, title: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.title && <p className="error-state" role="alert">{fieldErrors.title}</p>}

        <OutlinedTextField
          label="Description"
          type="textarea"
          rows={3}
          value={form.description}
          onInput={(e: Event) => setForm((f) => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))}
        />
        {fieldErrors?.description && <p className="error-state" role="alert">{fieldErrors.description}</p>}

        <OutlinedTextField
          label="Icon"
          value={form.icon ?? ''}
          onInput={(e: Event) => setForm((f) => ({ ...f, icon: (e.target as HTMLInputElement).value }))}
        />
        <p className="field-hint">Material Symbol name, e.g. search, star, local_shipping.</p>
        {fieldErrors?.icon && <p className="error-state" role="alert">{fieldErrors.icon}</p>}

        <label className="widget-assign-row__label">
          <input
            type="checkbox"
            checked={form.isActive ?? true}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          Active
        </label>

        {error && <p className="error-state" role="alert">{error}</p>}
      </div>
      <div slot="actions">
        <TextButton onClick={() => dialogRef.current?.close()}>Cancel</TextButton>
        <FilledButton ref={saveButtonRef} onClick={submit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </FilledButton>
      </div>
    </Dialog>
  );
}

/**
 * How It Works admin page — an intro (hero) singleton form (same GET/PATCH shape as
 * `about-us.tsx`) plus a flat, manually reorderable list of steps below it. Step counts are small
 * (a handful), so the steps section is a plain list with up/down arrow buttons (mirroring
 * `blog-block-editor.tsx`'s reorder interaction) rather than a `<sky-data-table>`.
 */
export function HowItWorksPage() {
  const { token, can } = useAuth();
  const { showToast } = useToast();
  const canEdit = can('cms.how-it-works', 'edit');
  const canCreate = can('cms.how-it-works', 'create');
  const canDelete = can('cms.how-it-works', 'delete');

  const [content, setContent] = useState<HowItWorksContent | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState('');
  const [contentForm, setContentForm] = useState<HowItWorksContentInput>(EMPTY_CONTENT_FORM);
  const [contentFieldErrors, setContentFieldErrors] = useState<Partial<Record<ContentFieldKey, string>> | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const contentSubmittingRef = useRef(false);

  const [steps, setSteps] = useState<HowItWorksStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [stepsError, setStepsError] = useState('');
  const [editingStep, setEditingStep] = useState<HowItWorksStep | null>(null);
  const addStepDialogRef = useRef<MdDialog>(null);
  const editStepDialogRef = useRef<MdDialog>(null);

  const loadContent = useCallback(async () => {
    setContentLoading(true);
    setContentError('');
    try {
      const { data } = await getHowItWorksContent(token);
      setContent(data);
      setContentForm({
        heroTitle: data.heroTitle,
        heroSubtitle: data.heroSubtitle,
        metaTitle: data.metaTitle ?? '',
        metaDescription: data.metaDescription ?? '',
      });
    } catch (err) {
      setContentError(err instanceof ApiRequestError ? err.message : 'Could not load How It Works content.');
    } finally {
      setContentLoading(false);
    }
  }, [token]);

  const loadSteps = useCallback(async () => {
    setStepsLoading(true);
    setStepsError('');
    try {
      const { data } = await listHowItWorksSteps(token);
      setSteps(data);
    } catch (err) {
      setStepsError(err instanceof ApiRequestError ? err.message : 'Could not load steps.');
    } finally {
      setStepsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  useEffect(() => {
    loadSteps();
  }, [loadSteps]);

  const submitContent = async () => {
    if (contentSubmittingRef.current) return;
    contentSubmittingRef.current = true;
    setSavingContent(true);
    setContentError('');
    setContentFieldErrors(null);
    const payload: HowItWorksContentInput = {
      ...contentForm,
      metaTitle: contentForm.metaTitle?.trim() || undefined,
      metaDescription: contentForm.metaDescription?.trim() || undefined,
    };
    try {
      const { data } = await updateHowItWorksContent(token, payload);
      setContent(data);
      showToast('How It Works content saved.');
    } catch (err) {
      const fields = extractSiteContentFieldErrors<ContentFieldKey>(err);
      if (fields) {
        setContentFieldErrors(fields);
        setContentError('Fix the highlighted fields and try again.');
      } else {
        const msg = err instanceof ApiRequestError ? err.message : 'Could not save How It Works content.';
        setContentError(msg);
        showToast(msg, 'error');
      }
    } finally {
      contentSubmittingRef.current = false;
      setSavingContent(false);
    }
  };

  const saveStep = async (input: HowItWorksStepInput, existing?: HowItWorksStep) => {
    if (existing) {
      const { data } = await updateHowItWorksStep(token, existing.id, input);
      setSteps((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      showToast('Step updated.');
      return data;
    }
    const { data } = await createHowItWorksStep(token, input);
    setSteps((prev) => [...prev, data]);
    showToast('Step added.');
    return data;
  };

  const removeStep = async (step: HowItWorksStep) => {
    if (!window.confirm(`Delete "${step.title}"? This cannot be undone.`)) return;
    setStepsError('');
    try {
      await deleteHowItWorksStep(token, step.id);
      setSteps((prev) => prev.filter((s) => s.id !== step.id));
      showToast('Step deleted.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Could not delete step.';
      setStepsError(msg);
      showToast(msg, 'error');
    }
  };

  const moveStep = async (index: number, direction: -1 | 1) => {
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= steps.length) return;
    const next = [...steps];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setSteps(next);
    try {
      await reorderHowItWorksSteps(token, next.map((s) => s.id));
    } catch (err) {
      setSteps(steps); // revert on failure
      const msg = err instanceof ApiRequestError ? err.message : 'Could not reorder steps.';
      setStepsError(msg);
      showToast(msg, 'error');
    }
  };

  if (contentLoading) {
    return (
      <div className="admin-page">
        <title>How It Works · MSD</title>
        <meta name="robots" content="noindex" />
        <p className="loading-state">Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <title>How It Works · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>How It Works</h1>
          <p>Edit the intro copy and numbered steps shown on the public How It Works page.</p>
          {content?.updatedAt && <p className="field-hint">Last saved {new Date(content.updatedAt).toLocaleString()}</p>}
        </div>
      </header>

      <section aria-labelledby="how-it-works-intro">
        <h2 id="how-it-works-intro">Intro</h2>
        {contentError && <p className="error-state" role="alert">{contentError}</p>}

        <div className="form-grid">
          <OutlinedTextField
            label="Hero title"
            value={contentForm.heroTitle ?? ''}
            disabled={!canEdit}
            onInput={(e: Event) => setContentForm((f) => ({ ...f, heroTitle: (e.target as HTMLInputElement).value }))}
          />
          {contentFieldErrors?.heroTitle && <p className="error-state" role="alert">{contentFieldErrors.heroTitle}</p>}

          <OutlinedTextField
            label="Hero subtitle"
            value={contentForm.heroSubtitle ?? ''}
            disabled={!canEdit}
            onInput={(e: Event) => setContentForm((f) => ({ ...f, heroSubtitle: (e.target as HTMLInputElement).value }))}
          />
          {contentFieldErrors?.heroSubtitle && <p className="error-state" role="alert">{contentFieldErrors.heroSubtitle}</p>}

          <fieldset className="form-grid">
            <legend>SEO (optional)</legend>
            <OutlinedTextField
              label="Meta title"
              value={contentForm.metaTitle ?? ''}
              disabled={!canEdit}
              onInput={(e: Event) => setContentForm((f) => ({ ...f, metaTitle: (e.target as HTMLInputElement).value }))}
            />
            {contentFieldErrors?.metaTitle && <p className="error-state" role="alert">{contentFieldErrors.metaTitle}</p>}
            <OutlinedTextField
              label="Meta description"
              type="textarea"
              rows={2}
              value={contentForm.metaDescription ?? ''}
              disabled={!canEdit}
              onInput={(e: Event) => setContentForm((f) => ({ ...f, metaDescription: (e.target as HTMLTextAreaElement).value }))}
            />
            {contentFieldErrors?.metaDescription && <p className="error-state" role="alert">{contentFieldErrors.metaDescription}</p>}
          </fieldset>
        </div>

        {canEdit && (
          <div className="form-actions">
            <FilledButton onClick={submitContent} disabled={savingContent}>
              <Icon slot="icon" aria-hidden="true">save</Icon>
              {savingContent ? 'Saving…' : 'Save intro'}
            </FilledButton>
          </div>
        )}
      </section>

      <section aria-labelledby="how-it-works-steps">
        <header className="page-head">
          <h2 id="how-it-works-steps">Steps</h2>
          {canCreate && (
            <OutlinedButton onClick={() => addStepDialogRef.current?.show()}>
              <Icon slot="icon" aria-hidden="true">add</Icon>
              Add step
            </OutlinedButton>
          )}
        </header>

        {stepsError && <p className="error-state" role="alert">{stepsError}</p>}
        {stepsLoading && <p className="loading-state">Loading steps…</p>}
        {!stepsLoading && steps.length === 0 && <p className="empty-state">No steps yet.</p>}

        {!stepsLoading && steps.length > 0 && (
          <ul className="block-editor">
            {steps.map((step, i) => (
              <li className="block-editor__row" key={step.id}>
                <div className="block-editor__row-head">
                  {step.icon && <Icon aria-hidden="true">{step.icon}</Icon>}
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                    <p className="field-hint">{step.isActive ? 'Active' : 'Inactive'}</p>
                  </div>
                  <div className="block-editor__row-actions">
                    {canEdit && (
                      <>
                        <OutlinedButton onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label={`Move ${step.title} earlier`}>
                          <Icon slot="icon" aria-hidden="true">arrow_upward</Icon>
                        </OutlinedButton>
                        <OutlinedButton
                          onClick={() => moveStep(i, 1)}
                          disabled={i === steps.length - 1}
                          aria-label={`Move ${step.title} later`}
                        >
                          <Icon slot="icon" aria-hidden="true">arrow_downward</Icon>
                        </OutlinedButton>
                        <OutlinedButton
                          onClick={() => {
                            setEditingStep(step);
                            editStepDialogRef.current?.show();
                          }}
                          aria-label={`Edit ${step.title}`}
                        >
                          <Icon slot="icon" aria-hidden="true">edit</Icon>
                        </OutlinedButton>
                      </>
                    )}
                    {canDelete && (
                      <OutlinedButton onClick={() => removeStep(step)} aria-label={`Delete ${step.title}`}>
                        <Icon slot="icon" aria-hidden="true">delete</Icon>
                      </OutlinedButton>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canCreate && <StepFormDialog dialogRef={addStepDialogRef} onSave={(input) => saveStep(input)} />}

      {canEdit && editingStep && (
        <StepFormDialog
          key={editingStep.id}
          dialogRef={editStepDialogRef}
          step={editingStep}
          onSave={(input) => saveStep(input, editingStep)}
          onClose={() => setEditingStep(null)}
        />
      )}
    </div>
  );
}

export default HowItWorksPage;
