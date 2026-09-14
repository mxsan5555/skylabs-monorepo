import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { isDualRoleUser, resolvePostLoginPath, setExperienceMode } from '../../../auth/role-routing';
import './choose-experience.css';
import content from '../../../content.json';
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
      <title>{content.chooseExperience.pageTitle}</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="auth-brand">
        <div className="auth-brand__logo">
          <Icon aria-hidden="true">spa</Icon>
        </div>
        <h1 className="auth-brand__title">{content.chooseExperience.brandTitle.replace('{name}', bootstrap.user.name)}</h1>
        <p className="auth-brand__subtitle">{content.chooseExperience.brandSubtitle}</p>
      </div>
      <div className="auth-card">
        <h2>{content.chooseExperience.cardHeading}</h2>
        <p>{content.chooseExperience.cardDescription}</p>
        <div className="choose-experience-actions">
          <FilledButton className="auth-submit" onClick={chooseCustomer}>
            <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
            {content.chooseExperience.customerLabel}
          </FilledButton>
          <OutlinedButton className="auth-submit" onClick={chooseVendor}>
            <Icon slot="icon" aria-hidden="true">storefront</Icon>
            {content.chooseExperience.vendorLabel}
          </OutlinedButton>
        </div>
      </div>
    </div>
  );
}
export default ChooseExperience;
