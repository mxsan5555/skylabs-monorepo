import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  OutlinedTextField,
  Tabs,
  PrimaryTab,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { apiClient, ApiError, BASE_URL } from '../../../api/api-client';

type Method = 'email' | 'phone';

/**
 * Sign-in screen. Choose Email or Phone, enter the destination, and request a
 * one-time code — then continue to the OTP screen. Layout follows the design
 * reference; colors come from msd's M3 theme.
 */
export function SignIn() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>('phone');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isPhone = method === 'phone';

  const onTabChange = (event: Event) => {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    setMethod(index === 1 ? 'phone' : 'email');
    setError(null);
  };

  const sendOtp = async () => {
    if (pending) return;
    setError(null);

    if (!value.trim()) {
      setError(isPhone ? 'Enter your phone number.' : 'Enter your email address.');
      return;
    }

    setPending(true);
    try {
      const { retryAfterSeconds } = await apiClient.post<{
        ok: true;
        retryAfterSeconds: number;
      }>('/auth/otp/request', { method, destination: value });
      navigate('/otp', { state: { destination: value, method, retryAfterSeconds } });
    } catch (err) {
      if (err instanceof ApiError && err.retryAfterSeconds) {
        setError(`Please wait ${err.retryAfterSeconds}s before requesting another code.`);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setPending(false);
    }
  };

  const continueWithGoogle = () => {
    window.location.href = `${BASE_URL}/auth/google`;
  };

  return (
    <div className="auth-screen">
      <title>Sign in · MSD</title>
      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true">spa</Icon>
        </div>
        <h1 className="auth-brand__title">MSD</h1>
        <p className="auth-brand__subtitle">Your wellness companion</p>
      </div>

      <div className="auth-card">
        <h2>Sign in</h2>
        <p>Enter your details to receive a one-time code.</p>

        <Tabs
          className="auth-tabs"
          activeTabIndex={isPhone ? 1 : 0}
          onChange={onTabChange}
        >
          <PrimaryTab>
            <Icon slot="icon" aria-hidden="true">
              mail
            </Icon>
            Email
          </PrimaryTab>
          <PrimaryTab>
            <Icon slot="icon" aria-hidden="true">
              call
            </Icon>
            Phone
          </PrimaryTab>
        </Tabs>

        <OutlinedTextField
          className="auth-field"
          label={isPhone ? 'Phone number' : 'Email'}
          type={isPhone ? 'tel' : 'email'}
          autocomplete={isPhone ? 'tel' : 'email'}
          value={value}
          onInput={(event: Event) =>
            setValue((event.target as HTMLInputElement).value)
          }
        >
          <Icon slot="leading-icon" aria-hidden="true">
            {isPhone ? 'call' : 'mail'}
          </Icon>
        </OutlinedTextField>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <FilledButton className="auth-submit" onClick={sendOtp} disabled={pending}>
          {pending ? 'Sending…' : 'Send OTP'}
        </FilledButton>
      </div>

      <div className="auth-divider">
        <span>or continue with</span>
      </div>

      <OutlinedButton className="auth-google" onClick={continueWithGoogle}>
        <Icon slot="icon" aria-hidden="true">
          language
        </Icon>
        Continue with Google
      </OutlinedButton>

      <p className="auth-note">New users are registered automatically.</p>
    </div>
  );
}

export default SignIn;
