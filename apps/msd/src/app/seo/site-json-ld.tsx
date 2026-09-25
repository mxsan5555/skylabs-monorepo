import { useCatalogShell } from '../../catalog/catalog-shell';
import { JsonLd } from './json-ld';
import { organizationJsonLd, websiteJsonLd } from './jsonld';
import { SITE_URL } from './site-url';
import content from '../../content.json';
import logo from '../../assets/logo.jpg';

/** Organization + WebSite structured data for every public page. Needs VITE_SITE_URL. */
export function SiteJsonLd() {
  const { socialLinks } = useCatalogShell();
  if (!SITE_URL) return null;
  const name = content.site.fullName;
  return (
    <JsonLd
      data={[
        organizationJsonLd({ name, url: SITE_URL, logo: new URL(logo, `${SITE_URL}/`).toString(), sameAs: socialLinks.map((s) => s.url) }),
        websiteJsonLd({ name, url: SITE_URL }),
      ]}
    />
  );
}
