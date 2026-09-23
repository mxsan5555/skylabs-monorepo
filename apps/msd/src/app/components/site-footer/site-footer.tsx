import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell, useCategoryLinks } from '../../../catalog/catalog-shell';
import { useVisitorLocation } from '../../../location/location-context';
import { FooterColumn, type FooterLink } from './footer-column';
import { NewsletterBand } from './newsletter-band';
import { buildPopularSearches } from './popular-searches';
import { socialIcon } from './social-icons';
import { ThemeSwitch } from './theme-switch';
import content from '../../../content.json';
import logo from '../../../assets/logo.jpg';
import './site-footer.css';

const t = content.nav.footer;
const withIds = (links: { label: string; to: string }[]): FooterLink[] => links.map((l) => ({ id: l.to, ...l }));

/** Site footer: trust strip, newsletter band, brand + link columns, popular searches, legal bar. */
export function SiteFooter() {
  const { categories, locations, socialLinks } = useCatalogShell();
  const categoryLinks = useCategoryLinks();
  const { city } = useVisitorLocation();
  const popular = useMemo(() => buildPopularSearches(categories, locations, city), [categories, locations, city]);
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <ul className="trust-strip" aria-label={t.trustLabel}>
        {t.trust.map((item) => (
          <li key={item.text} className="trust-strip__item label-large">
            <Icon aria-hidden="true">{item.icon}</Icon>
            {item.text}
          </li>
        ))}
      </ul>

      <NewsletterBand />

      <div className="site-footer__main">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            <img src={logo} alt={content.site.fullName} width={402} height={171} />
          </Link>
          <p className="title-small">{content.site.tagline}</p>
          <p className="body-medium site-footer__desc">{content.site.description}</p>
          {socialLinks.length > 0 && (
            <ul className="site-footer__social" aria-label={t.socialLabel}>
              {socialLinks.map((s) => (
                <li key={s.id}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="site-footer__social-link"
                    aria-label={t.opensInNewTab.replace('{name}', s.displayName)}
                  >
                    {socialIcon(s.platform)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FooterColumn id="footer-discover" title={t.headings.discover} links={[...categoryLinks, ...withIds(t.discoverExtra)]} />
        <FooterColumn id="footer-company" title={t.headings.company} links={withIds(t.company)} />
        <FooterColumn id="footer-help" title={t.headings.help} links={withIds(t.help)} />
        <FooterColumn id="footer-partners" title={t.headings.partners} links={withIds(t.partners)} />
      </div>

      {popular.length > 0 && (
        <div className="site-footer__popular">
          <FooterColumn id="footer-popular" title={t.headings.popularSearches} links={popular} inline />
        </div>
      )}

      <div className="site-footer__legal">
        <p className="body-small">© {year} {t.copyright}</p>
        <nav aria-label={t.legalLabel}>
          <ul className="site-footer__legal-links">
            {t.legal.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="body-small">{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <ThemeSwitch />
      </div>
    </footer>
  );
}
