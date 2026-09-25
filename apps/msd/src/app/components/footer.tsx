import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { listCatalogSocialLinks, type CatalogSocialMediaLink } from '../../api/catalog';
import content from '../../content.json';
import logo from '../../assets/logo.png';
import logo2 from '../../assets/logo2.jpg';
import './footer.css';

const DEFAULT_ICON_PATH_D =
  'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z';

function GenericSocialIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={DEFAULT_ICON_PATH_D} fill="currentColor" />
    </svg>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  const normalized = platform.toLowerCase();

  switch (normalized) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.4" cy="6.7" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M13.5 21v-8h2.6l.4-3h-3V7.3c0-.9.3-1.5 1.7-1.5H16V3.1c-.4-.1-1.7-.2-3.2-.2-3.2 0-5.3 1.9-5.3 5.4V10H5v3h2.5v8h6z" fill="currentColor" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M21 12c0-1.8-.2-3.2-.5-4.4-.4-1.3-1.5-2.3-2.8-2.6C16.6 4.7 14.8 4 12 4s-4.6.7-5.7 1c-1.3.3-2.4 1.2-2.8 2.6C3.2 8.8 3 10.2 3 12s.2 3.2.5 4.4c.4 1.3 1.5 2.3 2.8 2.6.9.2 2.4.4 5.7.4s4.8-.2 5.7-.4c1.3-.3 2.4-1.2 2.8-2.6.3-1.2.5-2.6.5-4.4zm-10.1 3.1V8.9l5.3 3.1-5.3 3.1z" fill="currentColor" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6.9 8.3A1.8 1.8 0 1 1 6.9 4.7a1.8 1.8 0 0 1 0 3.6zm-1.4 1.8h2.8v9.3H5.5zm4.9 0h2.7v1.3h.1c.4-.7 1.3-1.5 2.7-1.5 2.9 0 3.4 1.9 3.4 4.4v3.1h-2.8v-2.8c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v2.9H10.4z" fill="currentColor" />
        </svg>
      );
    case 'x':
    case 'twitter':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18.9 3h3.2l-7 8 8.3 10h-6.5l-5.1-6.4-5.8 6.4H3l7.5-8.5L2.8 3h6.8l4.6 6.1L18.9 3zm-1.1 15.4h1.8L7.3 4.5H5.4l12.4 13.9z" fill="currentColor" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M19.1 4.9A9.8 9.8 0 0 0 4.3 17.6L3 21l3.5-1.1a9.8 9.8 0 0 0 12.6-14.9zm-2.2 12.7c-.4.1-.9.2-2.9-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1.3-1.7-1.3-3.3 0-1.6 1-2.4 1.3-2.7.3-.3.7-.4 1-.4h.6c.2 0 .5 0 .8.6.3.7.9 2.3 1 2.5.1.2.2.4.1.7-.1.2-.2.4-.3.6-.2.2-.3.4-.6.7-.2.2-.4.5-.2.8.2.3.9 1.5 2 2.4 1.3 1.2 2.4 1.5 2.7 1.7.3.2.5.2.7.1.2-.1.9-.9 1.2-1.2.2-.3.5-.2.8-.1.3.1 2 1.1 2.4 1.3.3.2.6.2.7.3.2.1.2.6.1 1.1-.1.6-1.1 1.6-1.6 1.8-.5.2-1.3.4-2.7.2z" fill="currentColor" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15.8 3.5c.4 1.6 1.5 2.9 3.1 3.5v2.7c-1.3 0-2.5-.3-3.6-.9v5.5c0 3.1-2.5 5.6-5.6 5.6s-5.6-2.5-5.6-5.6 2.5-5.6 5.6-5.6c.3 0 .7 0 1 .1v2.8a3.9 3.9 0 0 0-1-.1c-1.7 0-3 1.4-3 3.1s1.3 3.1 3 3.1 3-1.4 3-3.1V3.5h3.2z" fill="currentColor" />
        </svg>
      );
    default:
      return <GenericSocialIcon />;
  }
}

export function Footer() {
  const [socialLinks, setSocialLinks] = useState<CatalogSocialMediaLink[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void listCatalogSocialLinks()
      .then((response) => {
        if (!active) return;
        setSocialLinks(response?.data ?? []);
      })
      .catch(() => {
        if (!active) return;
        setSocialLinks([]);
      })
      .finally(() => {
        if (active) setSocialLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <NavLink to="/" className="site-footer__logo" aria-label={content.site.name}>
            <img src={logo} alt={content.site.name} className="site-footer__logo-image site-footer__logo-image--desktop" />
            <img src={logo2} alt={content.site.name} className="site-footer__logo-image site-footer__logo-image--mobile" />
          </NavLink>
          <p className="site-footer__desc">{content.site.description}</p>
        </div>

        <div className="site-footer__col">
          <h3 className="site-footer__col-heading">{content.nav.footer.headings.company}</h3>
          <ul className="site-footer__list">
            {content.nav.footer.company.map((item) => (
              <li key={item.label}>
                <Link to={item.to} className="site-footer__link">{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="site-footer__col">
          <h3 className="site-footer__col-heading">{content.nav.footer.headings.discover}</h3>
          <ul className="site-footer__list">
            {content.nav.footer.discover.map((item) => (
              <li key={item.label}>
                <Link to={item.to} className="site-footer__link">{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="site-footer__col">
          <h3 className="site-footer__col-heading">{content.nav.footer.headings.help}</h3>
          <ul className="site-footer__list">
            {content.nav.footer.help.map((item) => (
              <li key={item.label}>
                <Link to={item.to} className="site-footer__link">{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="site-footer__col site-footer__col--newsletter">
          <h3 className="site-footer__col-heading">{content.nav.footer.headings.newsletter}</h3>
          <p className="site-footer__newsletter-sub">{content.nav.footer.newsletter.sub}</p>
          <form className="site-footer__newsletter-form">
            <label htmlFor="footer-email" className="sr-only">{content.nav.footer.newsletter.emailLabel}</label>
            <input id="footer-email" type="email" placeholder={content.nav.footer.newsletter.emailLabel} aria-label={content.nav.footer.newsletter.emailLabel} />
            <button type="submit">{content.nav.footer.newsletter.submitLabel}</button>
          </form>
        </div>
      </div>

      <div className="site-footer__bottom">
        <div className="site-footer__bottom-inner">
          <div className="site-footer__legal">
            <div className="site-footer__address">{content.nav.footer.copyright}</div>
            {content.nav.footer.legal.map((item) => (
              <Link key={item.label} to={item.to} className="site-footer__link site-footer__link--legal">
                {item.label}
              </Link>
            ))}
          </div>

          <div className="site-footer__social" aria-label="Social media links">
            {socialLoading ? (
              <span className="site-footer__social-loading">Loading...</span>
            ) : (
              socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  className="site-footer__social-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.displayName}
                  title={link.displayName}
                >
                  <SocialIcon platform={link.platform} />
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
