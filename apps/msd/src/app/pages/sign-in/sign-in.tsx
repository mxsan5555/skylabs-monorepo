import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, OutlinedTextField, Tabs, PrimaryTab, Icon, } from '@skylabs-monorepo/shared-ui/react';
import content from '../../../content.json';
import { users } from '../../../data/users';
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
    setLoading(true);
    try {
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
      // Check whether user exists
      const user = users.find((u) =>
        isPhone ? u.mobile === input : u.email === input
      );
      if (!user) {
        setError(isPhone ? auth.validation.phoneNotRegistered : auth.validation.emailNotRegistered);
        return;
      }
      // Mock API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log('Mock OTP:', user.otp);
      navigate('/otp', { state: { user, role: user.role, method, destination: input, }, });
    } catch (error) {
      console.error(error);
      setError(auth.validation.somethingWentWrong);
    } finally {
      setLoading(false);
    }
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
        {error && <p className="auth-error">{error}</p>}
        <FilledButton className="auth-submit" onClick={sendOtp} disabled={loading}>
          {loading ? auth.buttons.sendingOtp : auth.buttons.sendOtp}
        </FilledButton>
      </div>
      <div className="auth-divider">
        <span>{auth.divider}</span>
      </div>

      <OutlinedButton className="auth-google">
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
