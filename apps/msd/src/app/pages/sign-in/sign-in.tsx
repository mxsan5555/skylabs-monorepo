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
import content from '../../../content.json';
type Method = 'email' | 'phone';

/**
 * Sign-in screen. Choose Email or Phone, enter the destination, and request a
 * one-time code — then continue to the OTP screen. Layout follows the design
 * reference; colors come from msd's M3 theme.
 */
const validateEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validatePhone = (value: string) =>
  /^[6-9]\d{9}$/.test(value);
export function SignIn() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>('phone');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const auth = content.auth.signIn
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
  // const sendOtp = () => {
  //   navigate('/otp', {
  //     state: { destination: value || (isPhone ? auth.fields.phone.defaultValue : auth.fields.email.defaultValue), method },
  //   });
  // };

  return (
    <div className="auth-screen">
      <title>{auth.pageTitle}</title>
      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true"> {auth.brand.logoIcon}</Icon>
        </div>
        <h1 className="auth-brand__title"> {auth.brand.title}</h1>
        <p className="auth-brand__subtitle"> {auth.brand.subtitle}</p>
      </div>

      <div className="auth-card">
        <h2>{auth.heading}</h2>
        <p>{auth.description}</p>

        <Tabs
          className="auth-tabs"
          activeTabIndex={isPhone ? 1 : 0}
          onChange={onTabChange}
        >
          <PrimaryTab>
            <Icon slot="icon" aria-hidden="true">
              {auth.tabs.email.icon}
            </Icon>
            {auth.tabs.email.label}
          </PrimaryTab>
          <PrimaryTab>
            <Icon slot="icon" aria-hidden="true">
              {auth.tabs.phone.icon}
            </Icon>
            {auth.tabs.phone.label}
          </PrimaryTab>
        </Tabs>

        <OutlinedTextField
          className="auth-field"
          label={isPhone ? auth.fields.phone.label : auth.fields.email.label}
          type={isPhone ? 'tel' : 'email'}
          autocomplete={isPhone ? 'tel' : 'email'}
          inputMode={isPhone ? 'numeric' : 'email'}
          maxLength={isPhone ? 10 : undefined}
          value={value}
          onInput={(event: Event) => {
            const target = event.target as HTMLInputElement;
            if (isPhone) {
              // Allow only digits and limit to 10 characters
              const phone = target.value.replace(/\D/g, '').slice(0, 10);
              target.value = phone;
              setValue(phone);
            } else {
              setValue(target.value.trim());
            }
            if (error) setError('');
          }}
        >
          <Icon slot="leading-icon" aria-hidden="true">
            {isPhone ? auth.tabs.phone.icon : auth.tabs.email.icon}
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
        <span>{auth.divider}</span>
      </div>

      <OutlinedButton className="auth-google" onClick={continueWithGoogle}>
        <Icon slot="icon" aria-hidden="true">
          {auth.googleIcon}
        </Icon>
        {auth.buttons.continueWithGoogle}
      </OutlinedButton>

      <p className="auth-note">{auth.note}</p>
    </div>
  );
}

export default SignIn;
