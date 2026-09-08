import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { getCatalogContactUs, type CatalogContactUs } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import './contact.css';

/** Public Contact Us page — `GET /catalog/contact-us` on mount. Renders the singleton
 *  `ContactUsContent` row's address/phone/email/map/social links as saved from the CMS admin
 *  page (`pages/account/cms/contact-us.tsx`). Social links show the platform name as visible
 *  link text rather than a fixed per-platform icon set (unlike `footer.tsx`'s `SOCIAL_ICONS`
 *  map, which only covers 4 known platforms) — `platform` is a freeform string the admin can set
 *  to anything, so there is no reliable icon to pick per row. */
export function Contact() {
  const [contactUs, setContactUs] = useState<CatalogContactUs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getCatalogContactUs()
      .then(({ data }) => {
        if (!cancelled) setContactUs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'Could not load this page.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="contact">
        <title>Contact Us · MSD</title>
        <p className="loading-state">Loading…</p>
      </main>
    );
  }

  if (error || !contactUs) {
    return (
      <main className="contact">
        <title>Contact Us · MSD</title>
        <p className="error-state" role="alert">{error || 'This page is not available right now.'}</p>
      </main>
    );
  }

  const hasAnyDetail =
    contactUs.address || contactUs.phone || contactUs.email || contactUs.mapEmbedUrl || contactUs.socialLinks.length > 0;

  return (
    <main className="contact">
      <title>{contactUs.metaTitle || 'Contact Us · MSD'}</title>
      <meta name="description" content={contactUs.metaDescription || 'Get in touch with MySpaDeal.'} />
      <h1>Contact Us</h1>

      {!hasAnyDetail ? (
        <p className="empty-state">Contact details are coming soon.</p>
      ) : (
        <div className="contact__grid">
          <section className="contact__details" aria-label="Contact details">
            {contactUs.address && (
              <p className="contact__row">
                <Icon aria-hidden="true">location_on</Icon>
                <span>{contactUs.address}</span>
              </p>
            )}
            {contactUs.phone && (
              <p className="contact__row">
                <Icon aria-hidden="true">call</Icon>
                <a href={`tel:${contactUs.phone}`}>{contactUs.phone}</a>
              </p>
            )}
            {contactUs.email && (
              <p className="contact__row">
                <Icon aria-hidden="true">mail</Icon>
                <a href={`mailto:${contactUs.email}`}>{contactUs.email}</a>
              </p>
            )}
            {contactUs.socialLinks.length > 0 && (
              <nav className="contact__social" aria-label="Follow us on social media">
                {contactUs.socialLinks.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="contact__social-link">
                    <Icon aria-hidden="true">link</Icon>
                    {link.platform}
                  </a>
                ))}
              </nav>
            )}
          </section>

          {contactUs.mapEmbedUrl && (
            <div className="contact__map">
              <iframe src={contactUs.mapEmbedUrl} title="Location map" loading="lazy" allowFullScreen />
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default Contact;
