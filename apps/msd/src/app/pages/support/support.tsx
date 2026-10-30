import { useState, type FormEvent } from 'react';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { showSnackbar } from '../../../snackbar/snackbar';
import { ApiRequestError } from '../../../api/rbac/client';
import { createCustomerSupport } from '../../../api/support';
import { SectionHead } from '../../components/section-head/section-head';
import { FormPanel, FormPanelSection } from '../../components/form-panel/form-panel';
import { FormField, renderTextField } from '../../components/form-controls/form-controls';
import { Seo } from '../../seo/seo';
import content from '../../../content.json';

const t = content.support;
const FORM_ID = 'support-form-title';

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
    } catch (err: unknown) {
      showSnackbar(err instanceof ApiRequestError ? err.message : t.failed, { variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Seo title={t.metaTitle} description={t.metaDescription} path={t.path} noindex />
      <SectionHead as="h1" id="support-heading" titleClassName="headline-medium" heading={t.title} subheading={t.description} />
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <FormPanel
          id={FORM_ID}
          heading={t.formHeading}
          footerLead={
            error && (
              <p className="form-field__error body-medium" role="alert">
                {error}
              </p>
            )
          }
          actions={
            <FilledButton type="submit" disabled={sending}>
              <Icon slot="icon" aria-hidden="true">
                send
              </Icon>
              {sending ? t.sending : t.submit}
            </FilledButton>
          }
        >
          <FormPanelSection>
            <div className="form-grid form-grid--stack">
              <FormField wide>
                {renderTextField({ label: t.subject, value: subject, required: true, error: Boolean(error) && !subject.trim(), onInput: setSubject })}
              </FormField>
              <FormField wide>
                {renderTextField({ label: t.message, type: 'textarea', rows: 6, value: message, required: true, error: Boolean(error) && !message.trim(), onInput: setMessage })}
              </FormField>
            </div>
          </FormPanelSection>
        </FormPanel>
      </form>
    </>
  );
}

export default Support;
