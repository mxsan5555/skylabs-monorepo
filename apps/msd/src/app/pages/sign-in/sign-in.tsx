import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, OutlinedTextField, Tabs, PrimaryTab, Icon, } from '@skylabs-monorepo/shared-ui/react';
import content from '../../../content.json';
import { googleSignInUrl, requestOtp } from '../../../api/rbac/auth';
import { ApiRequestError } from '../../../api/rbac/client';

type Method = 'email' | 'phone';

const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * Sign-in screen. Choose Email or Phone, request a one-time code from the
 * real msd-api (`POST /auth/otp/request`), then continue to the OTP screen.
 * Serves every signed-in area of the app — the consumer storefront (cart,
 * wishlist, checkout) and the staff console under `/account/*` alike; which
 * one a user lands on and can navigate to is entirely permission-driven via
 * `bootstrap.menu`/`bootstrap.permissions`, not anything decided here.
 */
const validateEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validatePhone = (value: string) =>
  /^[6-9]\d{9}$/.test(value);
export function SignIn() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<Method>('phone');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const auth = content.auth.signIn;
  const isPhone = method === 'phone';
  const onTabChange = (event: Event) => {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    setMethod(index === 1 ? 'phone' : 'email');
    setValue('');
    setError('');
  };
  const sendOtp = async () => {
    setError('');
    const input = value.trim();
    if (!input) {
      setError(isPhone ? auth.validation.emptyPhone : auth.validation.emptyEmail);
      return;
    }
    if (isPhone && !validatePhone(input)) {
      setError(auth.validation.invalidPhone);
      return;
    }
    if (!isPhone && !validateEmail(input)) {
      setError(auth.validation.invalidEmail);
      return;
    }
    setLoading(true);
    try {
      await requestOtp(input, 'login');
      navigate('/otp', { state: { identifier: input, method } });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : auth.validation.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <title>{auth.pageTitle}</title>
      <meta name="robots" content="noindex, nofollow" />
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
        {error && <p className="auth-error">{error}</p>}
        <FilledButton className="auth-submit" onClick={sendOtp} disabled={loading}>
          {loading ? auth.buttons.sendingOtp : auth.buttons.sendOtp}
        </FilledButton>
      </div>
      <div className="auth-divider">
        <span>{auth.divider}</span>
      </div>

      <OutlinedButton className="auth-google" href={googleSignInUrl(API_BASE_URL)}>
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
