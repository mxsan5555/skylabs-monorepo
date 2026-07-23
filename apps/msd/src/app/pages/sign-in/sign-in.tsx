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

  const isPhone = method === 'phone';

  const onTabChange = (event: Event) => {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    setMethod(index === 1 ? 'phone' : 'email');
  };

  const sendOtp = () => {
    navigate('/otp', {
      state: { destination: value || (isPhone ? '4564' : 'you@email.com'), method },
    });
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

        <FilledButton className="auth-submit" onClick={sendOtp}>
          Send OTP
        </FilledButton>
      </div>

      <div className="auth-divider">
        <span>or continue with</span>
      </div>

      <OutlinedButton className="auth-google">
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
