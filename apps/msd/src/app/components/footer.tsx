<<<<<<< HEAD
import { NavLink } from 'react-router-dom';
import { Icon, IconButton, OutlinedButton, Divider, } from '@skylabs-monorepo/shared-ui/react';
import { copy } from '../../copy/copy';

export function Footer() {
  const { footer } = copy;
  return (
    <footer className="app-footer">
      <section className="footer-brand">
        <div className="footer-logo">
          <Icon>{footer.brand.icon}</Icon>
          <h2>{footer.brand.name}</h2>
        </div>
        <p>{footer.company.description}</p>
      </section>
      <Divider />
      <section className="footer-links">
        {footer.columns.map((column) => (
          <div className="footer-column" key={column.title}>
            <h3>
              <Icon>{column.icon}</Icon>
              {column.title}
            </h3>
            <nav className="footer-nav">
              {column.links.map((link) => (
                <NavLink
                  key={link.href}
                  to={link.href}
                  className="footer-link"
                >
                  <Icon>chevron_right</Icon>
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
        <div className="footer-column">
          <h3>
            <Icon>download</Icon>
            {footer.download.title}
          </h3>
          <div className="footer-download">
            {footer.download.buttons.map((button) => (
              <OutlinedButton key={button.label}>
                <Icon slot="icon">{button.icon}</Icon>
                {button.label}
              </OutlinedButton>
            ))}
          </div>
        </div>
      </section>
      <Divider />
      <section className="footer-highlights">
        <div className="footer-social">
          {footer.social.map((social) => (
            <IconButton
              key={social.ariaLabel}
              aria-label={social.ariaLabel}
            >
              <Icon>{social.icon}</Icon>
            </IconButton>
          ))}
        </div>
        {footer.company.stats.map((stat) => (
          <div className="footer-stat" key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>
      <Divider />
      <section className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {footer.brand.name}
        </span>
        <div className="footer-bottom-links">
          {footer.bottomLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </section>
=======
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  OutlinedTextField,
  FilledButton,
  Icon,
  Divider,
} from '@skylabs-monorepo/shared-ui/react';
import { inputValue } from '../../utils/format';
import content from '../../content.json';
import './footer.css';

export function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

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
        {/* Brand column */}
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo" aria-label="MSD – MySpaDeal home">
            <span className="site-footer__logo-icon" aria-hidden="true">
              <Icon>spa</Icon>
            </span>
            <span>
              <strong className="site-footer__logo-name">{content.site.name}</strong>
              <span className="site-footer__logo-sub">{content.site.fullName}</span>
            </span>
          </Link>
          <p className="site-footer__desc">{content.site.description}</p>
          <div className="site-footer__social" aria-label="Follow us on social media">
            {footer.social.map((s) => (
              <a
                key={s.label}
                href={s.url}
                rel="noopener noreferrer"
                target="_blank"
                aria-label={s.label}
                className="site-footer__social-link"
              >
                <Icon aria-hidden="true">{s.icon}</Icon>
              </a>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <nav className="site-footer__col" aria-label="Quick links">
          <h3 className="site-footer__col-heading">{footer.headings.quickLinks}</h3>
          <ul className="site-footer__list">
            {footer.quickLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="site-footer__link">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Categories */}
        <nav className="site-footer__col" aria-label="Browse by category">
          <h3 className="site-footer__col-heading">{footer.headings.categories}</h3>
          <ul className="site-footer__list">
            {footer.categories.map((cat) => (
              <li key={cat.to}>
                <Link to={cat.to} className="site-footer__link">
                  {cat.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Support */}
        <nav className="site-footer__col" aria-label="Support links">
          <h3 className="site-footer__col-heading">{footer.headings.support}</h3>
          <ul className="site-footer__list">
            {footer.support.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="site-footer__link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Newsletter */}
        <div className="site-footer__newsletter">
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

          {/* Trust signals */}
          <div className="site-footer__trust" aria-label="Trust indicators">
            {footer.trust.map((badge) => (
              <span key={badge.text} className="site-footer__trust-badge">
                <Icon aria-hidden="true">{badge.icon}</Icon>
                {badge.text}
              </span>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Bottom bar */}
      <div className="site-footer__bottom">
        <div className="site-footer__bottom-inner">
          <address className="site-footer__address">
            © {year} {footer.copyright}
          </address>
          <nav className="site-footer__legal" aria-label="Legal links">
            {footer.legal.map((item, i) => (
              <span key={item.to}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <Link to={item.to} className="site-footer__link site-footer__link--legal">
                  {item.label}
                </Link>
              </span>
            ))}
          </nav>
        </div>
      </div>
>>>>>>> b8ad1f645856014b185848c108bb9207db76e646
    </footer>
  );
}