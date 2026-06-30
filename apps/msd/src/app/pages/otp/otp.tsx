import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedTextField,
  Icon,
  IconButton,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '../../../auth/auth-context';
import {
  sendMailOtp,
  sendMobileOtp,
  verifyMailOtp,
  verifyMobileOtp,
} from '../../../api/auth';
import { copy } from '../../../copy/copy';

const RESEND_SECONDS = 24;

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in and returns home. Includes a resend countdown.
 * Wired to the real auth context (mock token until the auth API exists).
 */
export function Otp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, setRoles } = useAuth();
  const user = (location.state as any)?.user;
  const [error, setError] = useState('');

  const destination =
    (location.state as { destination?: string } | null)?.destination ?? '4564';

  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    const timer = setInterval(
      () => setSeconds((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  // const verify = () => {
  //   // Real verification will call the auth API; for now accept any code.
  //   signIn('mock-token');
  //   navigate('/account');
  // };
  const verify = () => {
  if (!user) return;

  setError('');

  if (code !== user.otp) {
    setError(copy.errors.invalidOtp);
    return;
  }

  signIn('mock-token');
setRoles([user.role]);
  switch (user.role) {
    case 'admin':
      navigate('/account/deals');
      break;

    case 'marketing':
      navigate('/account/promotions');
      break;

    case 'sales':
      navigate('/account/sales');
      break;

    default:
      navigate('/account');
  }
};


  const resendOtp = () => {
    console.log("Resend OTP:", user?.otp);
    setSeconds(RESEND_SECONDS);
  };


  return (
    <div className="auth-screen otp-screen">
      <title>{copy.otp.pageTitle}</title>
      <IconButton
        className="otp-back"
        aria-label="Go back"
        onClick={() => navigate('/sign-in')}
      >
        <Icon aria-hidden="true">arrow_back</Icon>
      </IconButton>

      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true">sms</Icon>
        </div>
        <h1 className="auth-brand__title">{copy.otp.title}</h1>
        <p className="auth-brand__subtitle">{copy.otp.subtitle}</p>
        <span className="auth-destination">
          <Icon aria-hidden="true">call</Icon>
          {destination}
        </span>
      </div>

      <div className="auth-card">
        <h2>{copy.otp.enterCode}</h2>
        <p>{copy.otp.codeExpiry}</p>

        <OutlinedTextField
          className="otp-field"
          label={copy.otp.codeLabel}
          type="text"
          inputMode="numeric"
          autocomplete="one-time-code"
          maxLength={6}
          value={code}
          onInput={(event: Event) =>
            setCode((event.target as HTMLInputElement).value)
          }
        />

        <FilledButton className="auth-submit" onClick={verify}>
          Verify &amp; Continue
        </FilledButton>
      </div>

      <p className="otp-resend">
        {copy.otp.resendQuestion}{' '}
        {seconds > 0 ? (
          <span className="otp-muted">Resend in {seconds}s</span>
        ) : (
          // <TextButton onClick={() => setSeconds(RESEND_SECONDS)}>
          //   Resend code
          // </TextButton>
          <TextButton onClick={resendOtp}>
            Resend code
          </TextButton>
        )}
      </p>
    </div>
  );
}

export default Otp;
