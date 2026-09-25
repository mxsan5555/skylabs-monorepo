import { useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdFilledButton } from '@material/web/button/filled-button.js';
import { Dialog, FilledButton, OutlinedTextField, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { ApiRequestError } from '../../../../api/rbac/client';
import type { Faq, FaqInput } from '../../../../api/rbac/faqs';
import { extractFaqFieldErrors, type FaqFieldKey } from './field-errors';

/** Create/edit dialog for an FAQ — mirrors `categories.tsx`'s `CategoryFormDialog` structurally
 *  (`submittingRef` double-submit guard, per-field errors under each input), simplified since an
 *  FAQ has no slug, no media, and no rich-text body — just a question, a plain-text answer, and a
 *  manual display order (same "plain editable integer" convention as Category's own sort order). */
export function FaqFormDialog({
  dialogRef,
  faq,
  onSave,
  onClose,
}: {
  dialogRef: RefObject<MdDialog>;
  faq?: Faq;
  onSave: (input: FaqInput) => Promise<Faq | void>;
  onClose?: () => void;
}) {
  const [form, setForm] = useState<FaqInput>({
    question: faq?.question ?? '',
    answer: faq?.answer ?? '',
    sortOrder: faq?.sortOrder ?? 0,
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FaqFieldKey, string>> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const saveButtonRef = useRef<MdFilledButton>(null);

  const submit = async () => {
    if (submittingRef.current) return;
    setError('');
    setFieldErrors(null);
    if (!form.question.trim() || !form.answer.trim()) {
      setError('Question and answer are required.');
      return;
    }
    submittingRef.current = true;
    if (saveButtonRef.current) saveButtonRef.current.disabled = true;
    setSubmitting(true);
    try {
      await onSave(form);
      dialogRef.current?.close();
    } catch (err) {
      const fields = extractFaqFieldErrors(err);
      if (fields) {
        setFieldErrors(fields);
        setError('Fix the highlighted fields and try again.');
      } else {
        setError(err instanceof ApiRequestError ? err.message : 'Could not save FAQ.');
      }
    } finally {
      submittingRef.current = false;
      if (saveButtonRef.current) saveButtonRef.current.disabled = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog ref={dialogRef} onClose={onClose}>
      <div slot="headline">{faq ? 'Edit FAQ' : 'New FAQ'}</div>
      <div slot="content" className="form-grid">
        <OutlinedTextField
          label="Question"
          type="textarea"
          rows={2}
          value={form.question}
          onInput={(e: Event) => setForm((f) => ({ ...f, question: (e.target as HTMLTextAreaElement).value }))}
        />
        {fieldErrors?.question && <p className="error-state" role="alert">{fieldErrors.question}</p>}

        <OutlinedTextField
          label="Answer"
          type="textarea"
          rows={5}
          value={form.answer}
          onInput={(e: Event) => setForm((f) => ({ ...f, answer: (e.target as HTMLTextAreaElement).value }))}
        />
        {fieldErrors?.answer && <p className="error-state" role="alert">{fieldErrors.answer}</p>}

        <OutlinedTextField
          label="Display order"
          type="number"
          value={String(form.sortOrder ?? 0)}
          onInput={(e: Event) => setForm((f) => ({ ...f, sortOrder: Number((e.target as HTMLInputElement).value) || 0 }))}
        />
        <p className="field-hint">Lower numbers show first on the public FAQ list.</p>
        {fieldErrors?.sortOrder && <p className="error-state" role="alert">{fieldErrors.sortOrder}</p>}

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

export default FaqFormDialog;
