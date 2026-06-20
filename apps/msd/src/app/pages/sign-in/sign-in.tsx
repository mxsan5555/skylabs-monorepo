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
import {
  sendMailOtp,
  sendMobileOtp,
} from '../../../api/auth';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };
  const validatePhone = (value: string) => {
    return /^[6-9]\d{9}$/.test(value);
  };

  const isPhone = method === 'phone';

  const onTabChange = (event: Event) => {
    const index = (event.target as HTMLElement & { activeTabIndex: number })
      .activeTabIndex;
    setMethod(index === 1 ? 'phone' : 'email');
    setValue('');
    setError('');
  };
  // fake navigation to otp page
  const sendOtp = () => {
    navigate('/otp', {
      state: { destination: value || (isPhone ? '4564' : 'you@email.com'), method },
    });
  };

  // const sendOtp = async () => {
  //   if (!value.trim()) {
  //     setError(
  //       isPhone
  //         ? 'Phone number is required'
  //         : 'Email is required',
  //     );
  //     return;
  //   }
  //   if (isPhone && !validatePhone(value)) {
  //     setError('Enter a valid Indian mobile number');
  //     return;
  //   }
  //   if (!isPhone && !validateEmail(value)) {
  //     setError('Enter a valid email address');
  //     return;
  //   }
  //   try {
  //     setLoading(true);

  //     if (method === 'email') {
  //       await sendMailOtp(value);
  //     } else {
  //       await sendMobileOtp(value);
  //     }

  //     navigate('/otp', {
  //       state: {
  //         destination: value,
  //         method,
  //       },
  //     });

  //   } catch (error) {
  //     console.error('OTP send failed:', error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

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
          // onInput={(event: Event) =>
          //   setValue((event.target as HTMLInputElement).value)
          // }
          onInput={(event: Event) => {
            const target = event.target as HTMLInputElement & {
              value: string;
            };

            let input = target.value;

            if (isPhone) {
              input = input.replace(/\D/g, '');

              if (input.length > 0 && !/[6-9]/.test(input[0])) {
                setError(
                  'Enter a valid Indian mobile number',
                );
                input = '';
              } else {
                setError('');
              }

              input = input.slice(0, 10);
              target.value = input;
            }

            setValue(input);
          }}
        >
          <Icon slot="leading-icon" aria-hidden="true">
            {isPhone ? 'call' : 'mail'}
          </Icon>
        </OutlinedTextField>
        {error && <p className="auth-error">{error}</p>}

        <FilledButton className="auth-submit" onClick={sendOtp} disabled={loading}>
          {loading ? 'Sending...' : 'Send OTP'}
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
