import { ProfileForm } from '../account/profile-form';
import { SectionHead } from '../../components/section-head/section-head';
import { Seo } from '../../seo/seo';
import content from '../../../content.json';

const t = content.profile;

/** `/my-account`: the storefront profile page. Same `ProfileForm` as the console's
 *  `/account/profile`, under the account shell's sidebar. */
export function MyAccountProfile() {
  return (
    <>
      <Seo title={t.metaTitle} description={t.metaDescription} path={t.path} noindex />
      <SectionHead as="h1" id="profile-heading" titleClassName="headline-medium" heading={t.title} subheading={t.subtitle} />
      <ProfileForm />
    </>
  );
}

export default MyAccountProfile;
