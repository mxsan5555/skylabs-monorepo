import { useState, type FormEvent } from 'react';
import { FilledButton, Icon, OutlinedTextField } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { showSnackbar } from '../../../snackbar/snackbar';
import { ApiRequestError } from '../../../api/rbac/client';
import { createCustomerSupport } from '../../../api/support';
import { inputValue } from '../../../utils/format';
import content from '../../../content.json';

const t = content.support;

/** My account → Support: one request (subject + message) to `POST` customer support. */
export function Support() {
  const { token } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = !subject.trim() || !message.trim();
    setError(missing ? t.required : '');
    if (missing) return;
    setSending(true);
    try {
      await createCustomerSupport(token, { subject: subject.trim(), message: message.trim() });
      setSubject('');
      setMessage('');
      showSnackbar(t.sent, { variant: 'success' });
    } catch (error: unknown) {
      showSnackbar(error instanceof ApiRequestError ? error.message : t.failed, { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <title>{t.metaTitle}</title>
      <meta name="robots" content="noindex" />
      <div className="page-head">
        <div>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
        </div>
      </div>
      <form className="form-grid form-grid--stack" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <OutlinedTextField label={t.subject} value={subject} required error={Boolean(error) && !subject.trim()} onInput={(e) => setSubject(inputValue(e))} />
        <OutlinedTextField label={t.message} type="textarea" rows={5} value={message} required error={Boolean(error) && !message.trim()} onInput={(e) => setMessage(inputValue(e))} />
        {error && (
          <p className="error-state" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <FilledButton type="submit" disabled={sending}>
            <Icon slot="icon" aria-hidden="true">send</Icon>
            {sending ? t.sending : t.submit}
          </FilledButton>
        </div>
      </form>
    </>
  );
}

export default Support;
