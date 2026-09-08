import { useCallback, useEffect, useRef, useState } from 'react';
import { FilledButton, Icon, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getAboutUs, updateAboutUs, type AboutUsContent, type AboutUsInput } from '../../../../api/rbac/site-content';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MediaUploader } from '../../../components/media-uploader';
import { useToast } from '../../../../toast/toast-context';
import { BlogBlockEditor, sanitizeBlogBlocks } from './blog-block-editor';
import { extractSiteContentFieldErrors } from './field-errors';

type AboutUsFieldKey = keyof AboutUsInput;

const EMPTY_FORM: AboutUsInput = {
  heroTitle: '',
  heroSubtitle: '',
  missionStatement: '',
  body: [],
  metaTitle: '',
  metaDescription: '',
};

/**
 * About Us singleton form — GET on mount, PATCH on save (`AboutUsContent` has no create step;
 * `updateAboutUs` upserts server-side). Reuses `BlogBlockEditor` for the `body` field (same
 * `BlogBlock[]` shape as a Blog Post's body) and `MediaUploader entityType="about-us"` for the
 * hero image. Mirrors `categories.tsx`'s `submittingRef` double-submit guard and
 * `useToast()`/per-field-error conventions established across this CMS module.
 */
export function AboutUsPage() {
  const { token, can } = useAuth();
  const canEdit = can('cms.about-us', 'edit');
  const { showToast } = useToast();

  const [aboutUs, setAboutUs] = useState<AboutUsContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<AboutUsInput>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AboutUsFieldKey, string>> | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getAboutUs(token);
      setAboutUs(data);
      setForm({
        heroTitle: data.heroTitle,
        heroSubtitle: data.heroSubtitle,
        missionStatement: data.missionStatement,
        body: data.body,
        metaTitle: data.metaTitle ?? '',
        metaDescription: data.metaDescription ?? '',
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load About Us content.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError('');
    setFieldErrors(null);
    const payload: AboutUsInput = {
      ...form,
      body: sanitizeBlogBlocks(form.body ?? []),
      metaTitle: form.metaTitle?.trim() || undefined,
      metaDescription: form.metaDescription?.trim() || undefined,
    };
    try {
      const { data } = await updateAboutUs(token, payload);
      setAboutUs(data);
      showToast('About Us content saved.');
    } catch (err) {
      const fields = extractSiteContentFieldErrors<AboutUsFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        const msg = err instanceof ApiRequestError ? err.message : 'Could not save About Us content.';
        setError(msg);
        showToast(msg, 'error');
      }
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <title>About Us · MSD</title>
        <meta name="robots" content="noindex" />
        <p className="loading-state">Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <title>About Us · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>About Us</h1>
          <p>Edit the content shown on the public About Us page.</p>
          {aboutUs?.updatedAt && <p className="field-hint">Last saved {new Date(aboutUs.updatedAt).toLocaleString()}</p>}
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <div className="form-grid">
        <OutlinedTextField
          label="Hero title"
          value={form.heroTitle ?? ''}
          disabled={!canEdit}
          onInput={(e: Event) => setForm((f) => ({ ...f, heroTitle: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.heroTitle && <p className="error-state" role="alert">{fieldErrors.heroTitle}</p>}

        <OutlinedTextField
          label="Hero subtitle"
          value={form.heroSubtitle ?? ''}
          disabled={!canEdit}
          onInput={(e: Event) => setForm((f) => ({ ...f, heroSubtitle: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.heroSubtitle && <p className="error-state" role="alert">{fieldErrors.heroSubtitle}</p>}

        <OutlinedTextField
          label="Mission statement"
          type="textarea"
          rows={4}
          value={form.missionStatement ?? ''}
          disabled={!canEdit}
          onInput={(e: Event) => setForm((f) => ({ ...f, missionStatement: (e.target as HTMLTextAreaElement).value }))}
        />
        {fieldErrors?.missionStatement && <p className="error-state" role="alert">{fieldErrors.missionStatement}</p>}

        <BlogBlockEditor blocks={form.body ?? []} onChange={(body) => setForm((f) => ({ ...f, body }))} />
        {fieldErrors?.body && <p className="error-state" role="alert">{fieldErrors.body}</p>}

        <fieldset className="form-grid">
          <legend>SEO (optional)</legend>
          <OutlinedTextField
            label="Meta title"
            value={form.metaTitle ?? ''}
            disabled={!canEdit}
            onInput={(e: Event) => setForm((f) => ({ ...f, metaTitle: (e.target as HTMLInputElement).value }))}
          />
          {fieldErrors?.metaTitle && <p className="error-state" role="alert">{fieldErrors.metaTitle}</p>}
          <OutlinedTextField
            label="Meta description"
            type="textarea"
            rows={2}
            value={form.metaDescription ?? ''}
            disabled={!canEdit}
            onInput={(e: Event) => setForm((f) => ({ ...f, metaDescription: (e.target as HTMLTextAreaElement).value }))}
          />
          {fieldErrors?.metaDescription && <p className="error-state" role="alert">{fieldErrors.metaDescription}</p>}
        </fieldset>

        <MediaUploader
          entityType="about-us"
          entityId={aboutUs?.id ?? null}
          existingImages={aboutUs?.mediaImages ?? []}
          existingVideo={null}
          hideVideo
          token={token}
        />
      </div>

      {canEdit && (
        <div className="form-actions">
          <FilledButton onClick={submit} disabled={saving}>
            <Icon slot="icon" aria-hidden="true">save</Icon>
            {saving ? 'Saving…' : 'Save'}
          </FilledButton>
        </div>
      )}
    </div>
  );
}

export default AboutUsPage;
