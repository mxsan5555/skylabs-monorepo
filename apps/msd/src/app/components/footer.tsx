import { useState, useEffect } from 'react';
import { Link, } from 'react-router-dom';
import { OutlinedTextField, FilledButton, Icon, Divider, } from '@skylabs-monorepo/shared-ui/react';
import { inputValue } from '../../utils/format';
import content from '../../content.json';
import './footer.css';
import logo from "../../assets/logo5.jpeg";
import logo2 from "../../assets/logo2.jpg";
import { listCatalogCategories, listCatalogSocialLinks, type CatalogCategoryWithChildren, type CatalogSocialMediaLink, } from '../../api/catalog';
import { ApiRequestError } from '../../api/rbac/client';
/** Generic "link" glyph — fallback icon for any `platform` key an operator adds via the CMS
 *  Social Media admin screen that isn't one of the known keys below (`platform` is freeform text
 *  server-side, see `CatalogSocialMediaLink`'s doc comment), so a 7th+ platform never breaks
 *  rendering. */
const DEFAULT_SOCIAL_ICON = (
  <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
  </svg>
);
const SOCIAL_ICONS: Record<string, React.ReactElement> = {
  facebook: (
    <svg viewBox="0 0 200 200" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M180 100c0-44.179-35.821-80-80-80s-80 35.821-80 80c0 39.927 29.25 73.025 67.501 79.033V123.13H67.183V100h20.318V82.371c0-20.048 11.948-31.129 30.218-31.129c8.753 0 17.91 1.564 17.91 1.564v19.688h-10.092c-9.934 0-13.038 6.165-13.038 12.499V100h22.185l-3.543 23.13h-18.642v55.902C150.75 173.036 180 139.938 180 100z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 200 200" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M113.96 88.51L168.6 25h-12.95l-47.44 55.15L70.32 25H26.61l57.3 83.4l-57.3 66.6h12.95l50.1-58.24L129.68 175h43.71l-59.43-86.49h0zm-17.74 20.61l-5.81-8.3l-46.18-66.07h19.89l37.28 53.33l5.81 8.3l48.46 69.32h-19.89l-39.54-56.56h0z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 200 200" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M176.66 61.49c-1.84-6.89-7.27-12.31-14.15-14.15C150.03 44 100 44 100 44s-50.03 0-62.51 3.34c-6.88 1.84-12.31 7.26-14.15 14.15C20 73.97 20 100 20 100s0 26.03 3.34 38.51c1.84 6.89 7.27 12.31 14.15 14.15C49.97 156 100 156 100 156s50.03 0 62.51-3.34c6.88-1.84 12.31-7.26 14.15-14.15C180 126.03 180 100 180 100s0-26.03-3.34-38.51zM84 124V76l41.57 24L84 124z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 200 200" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M132.313 34.909c21.483.98 31.797 11.276 32.778 32.778c.668 14.642.668 49.977 0 64.625c-.98 21.483-11.276 31.797-32.778 32.778c-14.64.668-49.979.668-64.625 0c-21.483-.98-31.797-11.276-32.778-32.778c-.668-14.642-.668-49.977 0-64.625c.98-21.483 11.276-31.797 32.778-32.778c14.641-.668 49.976-.668 64.625 0zM67.031 20.516C38.273 21.828 21.85 37.812 20.516 67.031c-.688 15.09-.688 50.854 0 65.939c1.312 28.751 17.288 45.181 46.514 46.514c15.086.688 50.856.688 65.939 0c28.751-1.312 45.181-17.288 46.514-46.514c.688-15.09.688-50.854 0-65.939c-1.312-28.758-17.296-45.181-46.514-46.514c-15.089-.689-50.854-.689-65.938-.001zM100 58.937c-22.678 0-41.063 18.385-41.063 41.063S77.322 141.063 100 141.063s41.063-18.385 41.063-41.063c0-22.679-18.385-41.063-41.063-41.063zm0 67.718c-14.721 0-26.655-11.934-26.655-26.655c0-14.721 11.934-26.655 26.655-26.655c14.721 0 26.655 11.934 26.655 26.655c0 14.721-11.934 26.655-26.655 26.655z" />
      <circle fill="currentColor" cx="142.685" cy="57.315" r="9.596" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.83 9.83 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.176 15.207 0 12.05 0 5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893 0-3.176-1.237-6.165-3.423-8.452" />
    </svg>
  ),
};
export function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [categories, setCategories] = useState<CatalogCategoryWithChildren[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [socialLinks, setSocialLinks] = useState<CatalogSocialMediaLink[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    listCatalogCategories()
      .then(({ data }) => {
        if (!cancelled) { setCategories(data); }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err instanceof ApiRequestError ? err.message : 'Failed to load footer categories',);
          setCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) { setCategoriesLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    listCatalogSocialLinks()
      .then(({ data }) => {
        if (!cancelled) { setSocialLinks(data); }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err instanceof ApiRequestError ? err.message : 'Failed to load footer social links',);
          setSocialLinks([]);
        }
      })
      .finally(() => {
        if (!cancelled) { setSocialLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);
  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail('');
    }
  }
  const { footer } = content.nav;
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo" aria-label="MSD – MySpaDeal home">
            <img
              src={logo}
              alt="MySpaDeal"
              className="site-footer__logo-image site-footer__logo-image--desktop"
            />
            <img
              src={logo2}
              alt="MySpaDeal"
              className="site-footer__logo-image site-footer__logo-image--mobile"
            />
          </Link>
          <p className="site-footer__desc">{content.site.description}</p>
          <h3 className="site-footer__col-heading">{footer.headings.newsletter}</h3>
          <p className="site-footer__newsletter-sub">{footer.newsletter.sub}</p>
          {subscribed ? (
            <p className="site-footer__newsletter-success" role="status">
              <Icon aria-hidden="true">check_circle</Icon>
              {footer.newsletter.successMessage}
            </p>
          ) : (
            <form
              className="site-footer__newsletter-form"
              onSubmit={handleSubscribe}
              aria-label="Email newsletter signup"
            >
              <OutlinedTextField
                type="email"
                label={footer.newsletter.emailLabel}
                value={email}
                required
                onInput={(e) => setEmail(inputValue(e as unknown as Event))}
              >
                <Icon slot="leading-icon" aria-hidden="true">mail</Icon>
              </OutlinedTextField>
              <FilledButton type="submit">{footer.newsletter.submitLabel}</FilledButton>
            </form>
          )}
        </div>
        <nav className="site-footer__col" aria-label="Company">
          <h3 className="site-footer__col-heading">{footer.headings.company}</h3>
          <ul className="site-footer__list">
            {footer.company.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="site-footer__link">{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="site-footer__col" aria-label="Discover">
          <h3 className="site-footer__col-heading">{footer.headings.discover}</h3>
          <ul className="site-footer__list">
            {categoriesLoading ? (
              <li className="site-footer__link">Loading...</li>
            ) : (
              categories.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/category/${category.slug}`}
                    className="site-footer__link"
                  >
                    {category.name}
                  </Link>
                </li>
              ))
            )}
           
          </ul>
        </nav>
        <nav className="site-footer__col" aria-label="Help and Info">
          <h3 className="site-footer__col-heading">{footer.headings.help}</h3>
          <ul className="site-footer__list">
            {footer.help.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="site-footer__link">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <Divider />
      <div className="site-footer__bottom">
        <div className="site-footer__bottom-inner">
          <address className="site-footer__address"> © {year} {footer.copyright} </address>
          <nav className="site-footer__legal" aria-label="Legal links">
            {footer.legal.map((item, i) => (
              <span key={item.to}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <Link to={item.to} className="site-footer__link site-footer__link--legal"> {item.label}</Link>
              </span>
            ))}
          </nav>
          <div className="site-footer__social" aria-label="Follow us on social media">
            {socialLoading ? (
              <span className="site-footer__social-loading">Loading...</span>
            ) : (
              socialLinks.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  aria-label={s.displayName}
                  className="site-footer__social-link"
                >
                  {SOCIAL_ICONS[s.platform.toLowerCase()] ?? DEFAULT_SOCIAL_ICON}
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}