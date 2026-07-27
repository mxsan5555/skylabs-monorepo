import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedTextField, Icon, IconButton, TextButton, } from '@skylabs-monorepo/shared-ui/react';
import content from '../../../content.json';
import { useAuth } from '../../../auth/auth-context';
const RESEND_SECONDS = 24;

/**
 * OTP screen. Shows where the code was sent, takes the 6-digit code, and on
 * verify signs the user in and returns home. Includes a resend countdown.
 * Wired to the real auth context (mock token until the auth API exists).
 */
export function Otp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [error, setError] = useState('');
  const otpContent = content.auth.otp;
  const [loading, setLoading] = useState(false);
  const { user, destination } = (location.state as {
    user: {
      id: number;
      email: string;
      mobile: string;
      role: string;
      otp: string;
    };
    destination: string;
    method: 'email' | 'phone';
  }) || {};
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000,);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!user) { navigate('/sign-in', { replace: true }); }
  }, [user, navigate]);
  const verify = async () => {
    setLoading(true);
    setError('');
    try {
      if (!code.trim()) {
        setError(otpContent.validation.emptyOtp);
        return;
      }
      if (code.length !== 6) {
        setError(otpContent.validation.invalidOtp);
        return;
      }
      if (!user) {
        navigate('/sign-in');
        return;
      }
      if (code !== user.otp) {
        setError(otpContent.validation.invalidOtp);
        return;
      }
      // Optional: simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      signIn('mock-token');
      switch (user.role) {
        case 'admin':
          navigate('/admin');
          break;
        case 'marketing':
          navigate('/marketing');
          break;
        case 'sales':
          navigate('/sales');
          break;
        default:
          navigate('/account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen otp-screen">
      <title>{otpContent.pageTitle}</title>
      <IconButton
        className="otp-back"
        aria-label={otpContent.backAriaLabel}
        onClick={() => navigate('/sign-in')}
      >
        <Icon aria-hidden="true">{otpContent.icons.back}</Icon>
      </IconButton>

      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true">{otpContent.icons.logo}</Icon>
        </div>
        <h1 className="auth-brand__title">{otpContent.heading}</h1>
        <p className="auth-brand__subtitle">{otpContent.subtitle}</p>
        <span className="auth-destination">
          <Icon aria-hidden="true">{otpContent.icons.destination}</Icon>
          {destination}
        </span>
      </div>

      <div className="auth-card">
        <h2>{otpContent.enterCode}</h2>
        <p>{otpContent.description}</p>

        <OutlinedTextField
          className="otp-field"
          label={otpContent.fieldLabel}
          type="text"
          inputMode="numeric"
          autocomplete="one-time-code"
          maxLength={6}
          value={code}
          onInput={(event: Event) => {
            const target = event.target as HTMLInputElement;
            const otp = target.value.replace(/\D/g, '').slice(0, 6);
            target.value = otp;
            setCode(otp);
            if (error) setError('');
          }}
        />
        {error && <p className="auth-error">{error}</p>}
        <FilledButton className="auth-submit" onClick={verify} disabled={loading || code.length !== 6}>
          {loading ? otpContent.verifyingButton : otpContent.verifyButton}
        </FilledButton>
      </div>

      <p className="otp-resend">
        {otpContent.resend.question}{' '}
        {seconds > 0 ? (
          <span className="otp-muted">{otpContent.resend.countdown} {seconds}s</span>
        ) : (
          <TextButton onClick={() => setSeconds(RESEND_SECONDS)}>
            {otpContent.resend.button}
          </TextButton>
        )}
      </p>
    </div>
  );
}

export default Otp;
