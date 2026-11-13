import { LOGO_SRC } from '../../../brand';

/** Brand logo for a page header's right column (`SectionHead media`). Decorative: the site
 *  header already names the brand. */
export function PageHeadLogo() {
  return <img src={LOGO_SRC} alt="" width={402} height={171} />;
}
