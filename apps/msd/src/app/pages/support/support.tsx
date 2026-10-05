import { OutlinedButton, Icon, OutlinedTextField, } from '@skylabs-monorepo/shared-ui/react';
import './support.css';
import { useToast } from '../../../toast/toast-context';
import { useState } from 'react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { ApiRequestError } from '../../../api/rbac/client';
import { createCustomerSupport } from '../../../api/support';
export function Support() {
    const { token } = useAuth();
    const { showToast } = useToast();
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const handleSubmit = async () => {
        setErrorMessage('');
        if (!subject.trim() || !message.trim()) {
            showToast('Please enter both subject and message.', 'error');
            return;
        }
        setLoading(true);
        try {
            await createCustomerSupport(token, {
                subject: subject.trim(), message: message.trim(),
            });
            setSubject('');
            setMessage('');
            showToast('Your support request has been submitted successfully.', 'success',);
        } catch (error: unknown) {
            showToast(error instanceof ApiRequestError ? error.message : 'Unable to submit your support request. Please try again.', 'error',);
        } finally { setLoading(false); }
    };
    return (
        <div className="support-page">
            <sky-tile-card className="support-page__card">
                <div className="support-page__form">
                    <div className="support-page__field">
                        <OutlinedTextField
                            label="Subject"
                            value={subject}
                            onInput={(event) => setSubject((event.target as HTMLInputElement).value)}
                        />
                    </div>
                    <div className="support-page__field">
                        <OutlinedTextField
                            label="Message"
                            type="textarea"
                            value={message}
                            onInput={(event) => setMessage((event.target as HTMLTextAreaElement).value)}
                        />
                    </div>
                    <div className="support-page__actions">
                        <OutlinedButton disabled={loading} onClick={() => void handleSubmit()}>
                            <Icon slot="icon" aria-hidden="true">{loading ? 'hourglass_empty' : 'send'}</Icon>
                            {loading ? 'Submitting...' : 'Submit'}
                        </OutlinedButton>
                    </div>
                </div>
            </sky-tile-card>
        </div>
    );
}
export default Support;