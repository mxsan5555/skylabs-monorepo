import { useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedSelect, OutlinedTextField, SelectOption, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { SocialMediaLink, SocialMediaLinkInput } from '../../../../api/rbac/social-media';
import { extractSocialMediaLinkFieldErrors, type SocialMediaLinkFieldKey } from './field-errors';

const PLATFORM_OPTIONS = ['facebook', 'instagram', 'youtube', 'linkedin', 'x', 'whatsapp', 'other'] as const;

function labelFor(platform: string): string {
  if (platform === 'x') return 'X (Twitter)';
  if (platform === 'other') return 'Other';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

/** Create/edit dialog for a Social Media Link — mirrors `faq-form-dialog.tsx` structurally. The
 *  `platform` field is a fixed-option select (matching the icons the public footer already knows
 *  how to map) plus an "Other" option that reveals a free-text fallback input, since the backend
 *  field itself is plain text with no DB enum (see msd-api's `SocialMediaLink.platform` schema
 *  doc comment). */
export function SocialMediaFormDialog({
  dialogRef,
  link,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  link?: SocialMediaLink;
  onSave: (input: SocialMediaLinkInput) => Promise<SocialMediaLink | void>;
  onClose?: () => void;
}) {
  const initialIsOther = Boolean(link && !PLATFORM_OPTIONS.includes(link.platform as (typeof PLATFORM_OPTIONS)[number]));
  const [form, setForm] = useState<SocialMediaLinkInput>({
    platform: link?.platform ?? PLATFORM_OPTIONS[0],
    displayName: link?.displayName ?? '',
    url: link?.url ?? '',
    sortOrder: link?.sortOrder ?? 0,
    isActive: link?.isActive ?? true,
  });
  const [platformSelect, setPlatformSelect] = useState<string>(initialIsOther ? 'other' : (link?.platform ?? PLATFORM_OPTIONS[0]));
  const [otherPlatform, setOtherPlatform] = useState(initialIsOther ? (link?.platform ?? '') : '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SocialMediaLinkFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const onPlatformSelectChange = (value: string) => {
    setPlatformSelect(value);
    setForm((f) => ({ ...f, platform: value === 'other' ? otherPlatform : value }));
  };

  const onOtherPlatformChange = (value: string) => {
    setOtherPlatform(value);
    setForm((f) => ({ ...f, platform: value }));
  };

  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    setFieldErrors(null);
    if (!form.platform.trim() || !form.displayName.trim() || !form.url.trim()) {
      setError('Platform, display name, and URL are required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractSocialMediaLinkFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save social media link.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{link ? 'Edit social media link' : 'New social media link'}</div>
      <div slot="content" className="form-grid">
        <OutlinedSelect
          label="Platform"
          value={platformSelect}
          onChange={(e: Event) => onPlatformSelectChange((e.target as HTMLSelectElement).value)}
        >
          {PLATFORM_OPTIONS.map((opt) => (
            <SelectOption key={opt} value={opt}>
              <div slot="headline">{labelFor(opt)}</div>
            </SelectOption>
          ))}
        </OutlinedSelect>

        {platformSelect === 'other' && (
          <OutlinedTextField
            label="Platform name"
            value={otherPlatform}
            onInput={(e: Event) => onOtherPlatformChange((e.target as HTMLInputElement).value)}
          />
        )}
        {fieldErrors?.platform && <p className="error-state" role="alert">{fieldErrors.platform}</p>}

        <OutlinedTextField
          label="Display name"
          value={form.displayName}
          onInput={(e: Event) => setForm((f) => ({ ...f, displayName: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.displayName && <p className="error-state" role="alert">{fieldErrors.displayName}</p>}

        <OutlinedTextField
          label="URL"
          type="url"
          value={form.url}
          onInput={(e: Event) => setForm((f) => ({ ...f, url: (e.target as HTMLInputElement).value }))}
        />
        {fieldErrors?.url && <p className="error-state" role="alert">{fieldErrors.url}</p>}

        <OutlinedTextField
          label="Sort order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
        />
        {fieldErrors?.sortOrder && <p className="error-state" role="alert">{fieldErrors.sortOrder}</p>}

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

export default SocialMediaFormDialog;
