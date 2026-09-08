import { useCallback, useEffect, useRef, useState } from 'react';
import { FilledButton, Icon, OutlinedButton, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  getContactUs,
  updateContactUs,
  type ContactUsContent,
  type ContactUsInput,
  type SocialLink,
} from '../../../../api/rbac/site-content';
import { ApiRequestError } from '../../../../api/rbac/client';
import { useToast } from '../../../../toast/toast-context';
import { extractSiteContentFieldErrors } from './field-errors';

type ContactUsFieldKey = keyof ContactUsInput;

const EMPTY_FORM: ContactUsInput = {
  address: '',
  phone: '',
  email: '',
  mapEmbedUrl: '',
  socialLinks: [],
  metaTitle: '',
  metaDescription: '',
};

/** Repeatable `{platform, url}` rows — same bordered-row shape as `BlogBlockEditor`'s
 *  `.block-editor__row`, kept as a small local component since Contact Us is the only place
 *  social links are edited (not promoted to a shared file, per this task's own "doesn't need to
 *  be the same component" note). */
function SocialLinksEditor({
  links,
  onChange,
  disabled,
}: {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  disabled: boolean;
}) {
  const update = (i: number, patch: Partial<SocialLink>) => onChange(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(links.filter((_, idx) => idx !== i));
  const add = () => onChange([...links, { platform: '', url: '' }]);

  return (
    <fieldset className="block-editor">
      <legend>Social links</legend>
      {links.length === 0 && <p className="empty-state">No social links yet.</p>}
      {links.map((link, i) => (
        <div className="block-editor__row" key={i}>
          <OutlinedTextField
            label="Platform"
            value={link.platform}
            disabled={disabled}
            onInput={(e: Event) => update(i, { platform: (e.target as HTMLInputElement).value })}
          />
          <OutlinedTextField
            label="URL"
            value={link.url}
            disabled={disabled}
            onInput={(e: Event) => update(i, { url: (e.target as HTMLInputElement).value })}
          />
          <div className="block-editor__row-actions">
            <OutlinedButton onClick={() => remove(i)} disabled={disabled} aria-label={`Remove ${link.platform || 'social link'}`}>
              <Icon slot="icon" aria-hidden="true">delete</Icon>
              Remove
            </OutlinedButton>
          </div>
        </div>
      ))}
      <OutlinedButton onClick={add} disabled={disabled}>
        <Icon slot="icon" aria-hidden="true">add</Icon>
        Add social link
      </OutlinedButton>
    </fieldset>
  );
}

/**
 * Contact Us singleton form — same GET-on-mount/PATCH-on-save/toast/field-error shape as
 * `about-us.tsx`. No `MediaUploader` (`ContactUsContent` has no media relation, see
 * msd-api's schema doc comment).
 */
export function ContactUsPage() {
  const { token, can } = useAuth();
  const canEdit = can('cms.contact-us', 'edit');
  const { showToast } = useToast();

  const [loaded, setLoaded] = useState<ContactUsContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ContactUsInput>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ContactUsFieldKey, string>> | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getContactUs(token);
      setLoaded(data);
      setForm({
        address: data.address,
        phone: data.phone,
        email: data.email,
        mapEmbedUrl: data.mapEmbedUrl,
        socialLinks: data.socialLinks,
        metaTitle: data.metaTitle ?? '',
        metaDescription: data.metaDescription ?? '',
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load Contact Us content.');
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
    const payload: ContactUsInput = {
      ...form,
      socialLinks: (form.socialLinks ?? []).filter((l) => l.platform.trim() && l.url.trim()),
      metaTitle: form.metaTitle?.trim() || undefined,
      metaDescription: form.metaDescription?.trim() || undefined,
    };
    try {
      const { data } = await updateContactUs(token, payload);
      setLoaded(data);
      showToast('Contact Us content saved.');
    } catch (err) {
      const fields = extractSiteContentFieldErrors<ContactUsFieldKey>(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        const msg = err instanceof ApiRequestError ? err.message : 'Could not save Contact Us content.';
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
        <title>Contact Us · MSD</title>
        <meta name="robots" content="noindex" />
        <p className="loading-state">Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <title>Contact Us · MSD</title>
      <meta name="robots" content="noindex" />
      <header className="page-head">
        <div>
          <h1>Contact Us</h1>
          <p>Edit the content shown on the public Contact Us page.</p>
          {loaded?.updatedAt && <p className="field-hint">Last saved {new Date(loaded.updatedAt).toLocaleString()}</p>}
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <div className="form-grid">
        <OutlinedTextField
          label="Address"
          type="textarea"
          rows={3}
          value={form.address ?? ''}
          disabled={!canEdit}
          onInput={(e: Event) => setForm((f) => ({ ...f, address: (e.target as HTMLTextAreaElement).value }))}
        />
        {fieldErrors?.address && <p className="error-state" role="alert">{fieldErrors.address}</p>}

        <OutlinedTextField
          label="Phone"
          value={form.phone ?? ''}
          disabled={!canEdit}
          onInput={(e: Event) => setForm((f) => ({ ...f, phone: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.phone && <p className="error-state" role="alert">{fieldErrors.phone}</p>}

        <OutlinedTextField
          label="Email"
          type="email"
          value={form.email ?? ''}
          disabled={!canEdit}
          onInput={(e: Event) => setForm((f) => ({ ...f, email: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.email && <p className="error-state" role="alert">{fieldErrors.email}</p>}

        <OutlinedTextField
          label="Map embed URL"
          value={form.mapEmbedUrl ?? ''}
          disabled={!canEdit}
          onInput={(e: Event) => setForm((f) => ({ ...f, mapEmbedUrl: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.mapEmbedUrl && <p className="error-state" role="alert">{fieldErrors.mapEmbedUrl}</p>}

        <SocialLinksEditor
          links={form.socialLinks ?? []}
          onChange={(socialLinks) => setForm((f) => ({ ...f, socialLinks }))}
          disabled={!canEdit}
        />
        {fieldErrors?.socialLinks && <p className="error-state" role="alert">{fieldErrors.socialLinks}</p>}

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

export default ContactUsPage;
