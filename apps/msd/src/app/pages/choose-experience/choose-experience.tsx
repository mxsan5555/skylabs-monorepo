import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { isDualRoleUser, resolvePostLoginPath, setExperienceMode } from '../../../auth/role-routing';
import './choose-experience.css';

/**
 * "Continue as" chooser — the only place a user who holds both `customer` and `vendor` roles
 * (self-registering as a vendor adds the role, it never removes `customer`, so this is the
 * common dual-role case, not a rare one) is asked which experience they want. Reached only
 * right after sign-in (see `otp.tsx`'s `resolvePostLoginPath`); a single-role user who lands
 * here directly (e.g. a stale bookmark) is bounced straight to their one destination instead
 * of seeing a pointless choice.
 */
export function ChooseExperience() {
  const navigate = useNavigate();
  const { bootstrap, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!bootstrap) {
      navigate('/sign-in', { replace: true });
      return;
    }
    if (!isDualRoleUser(bootstrap)) {
      navigate(resolvePostLoginPath(bootstrap), { replace: true });
    }
  }, [loading, bootstrap, navigate]);

  const chooseCustomer = () => {
    setExperienceMode('customer');
    navigate('/', { replace: true });
  };

  const chooseVendor = () => {
    setExperienceMode('vendor');
    navigate('/account/dashboard', { replace: true });
  };

  if (loading || !bootstrap || !isDualRoleUser(bootstrap)) return null;

  return (
    <div className="auth-screen">
      <title>Choose your experience · MSD</title>
      <meta name="robots" content="noindex, nofollow" />

      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true">spa</Icon>
        </div>
        <h1 className="auth-brand__title">Welcome back, {bootstrap.user.name}</h1>
        <p className="auth-brand__subtitle">
          Your account is set up as both a customer and a vendor. Choose how you'd like to continue.
        </p>
      </div>

      <div className="auth-card">
        <h2>Continue as</h2>
        <p>You can switch between the two later from your account menu.</p>
        <div className="choose-experience-actions">
          <FilledButton className="auth-submit" onClick={chooseCustomer}>
            <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
            Continue as Customer
          </FilledButton>
          <OutlinedButton className="auth-submit" onClick={chooseVendor}>
            <Icon slot="icon" aria-hidden="true">storefront</Icon>
            Continue as Vendor
          </OutlinedButton>
        </div>
      </div>
    </div>
  );
}

export default ChooseExperience;
