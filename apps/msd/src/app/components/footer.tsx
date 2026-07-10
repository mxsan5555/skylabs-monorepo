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
    </footer>
  );
}