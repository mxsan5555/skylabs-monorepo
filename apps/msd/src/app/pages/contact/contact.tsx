import { useEffect, useState } from 'react';
import { Icon, FilledButton, OutlinedTextField, } from '@skylabs-monorepo/shared-ui/react';
import { getCatalogContactUs, type CatalogContactUs } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import './contact.css';
import { validateEmail, validatePhone } from '../../../utils/validation';
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
  const [phone, setPhone] = useState('');
  const handlePhoneInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const numbersOnly = target.value.replace(/\D/g, '').slice(0, 10);
    target.value = numbersOnly;
    setPhone(numbersOnly);
  };
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '');
    const phoneNumber = String(formData.get('phone') ?? '');
    if (!validateEmail(email)) {alert('Please enter a valid email address.');return;}
    if (!validatePhone(phoneNumber)) {alert('Please enter a valid 10-digit mobile number.');return;}
   };
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getCatalogContactUs()
      .then(({ data }) => {if (!cancelled) setContactUs(data);})
      .catch((err) => {if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'Could not load this page.');})
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
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
  const hasAnyDetail = contactUs.address || contactUs.phone || contactUs.email || contactUs.socialLinks.length > 0;
  return (
    <main className="contact">
      <title>{contactUs.metaTitle || 'Contact Us · MSD'}</title>
      <meta name="description" content={contactUs.metaDescription || 'Get in touch with MySpaDeal.'}  />
      <section className="contact__layout" aria-label="Contact us">
        <div className="contact__form-section">
          <div className="contact__form-copy">
            <h1>Contact Us</h1>
          </div>
          <sky-tile-card
            // headline="Your Enquiry"
            text="Fill in your details and our team will get in touch."
            color="none"
          >
            <form className="contact__fields" onSubmit={handleSubmit}>
              <div className="contact__fields-row">
                <OutlinedTextField
                  label="Full Name"
                  name="fullName"
                  type="text"
                  placeholder="Your name"
                  autocomplete="name"
                  required
                />
                <OutlinedTextField
                  label="Email Address"
                  name="email"
                  type="email"
                  placeholder="Your email address"
                  autocomplete="email"
                  required
                />
              </div>
              <div className="contact__fields-row">
                <OutlinedTextField
                  label="Contact No."
                  name="phone"
                  type="tel"
                  placeholder="10-digit mobile number"
                  autocomplete="tel"
                  maxLength={10}
                  value={phone}
                  onInput={handlePhoneInput}
                  required
                />
                <OutlinedTextField
                  label="Subject"
                  name="subject"
                  type="text"
                  placeholder="What is your enquiry about?"
                  required
                />
              </div>
              <OutlinedTextField
                label="Message"
                name="message"
                type="textarea"
                rows={4}
                placeholder="Write your message..."
                required
              />
              <FilledButton type="submit">Send Message</FilledButton>
            </form>
          </sky-tile-card>
        </div>
        <div className="contact__map-section">
          {contactUs.mapEmbedUrl && (
            <div className="contact__map">
              <iframe
                src={contactUs.mapEmbedUrl}
                title="MySpaDeal location map"
                loading="lazy"
                allowFullScreen
              />
            </div>
          )}
          {hasAnyDetail && (
            <div className="contact__info-grid">
              {contactUs.address && (
                <sky-tile-card
                  icon="location_on"
                  iconStyle="plain"
                  headline="Address"
                  text={contactUs.address}
                  color="none"
                />
              )}
              {contactUs.phone && (
                <sky-tile-card
                  icon="call"
                  iconStyle="plain"
                  headline="Phone"
                  text={contactUs.phone}
                  color="none"
                />
              )}
              {contactUs.email && (
                <sky-tile-card
                  icon="mail"
                  iconStyle="plain"
                  headline="Email"
                  text={contactUs.email}
                  color="none"
                />
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
export default Contact;
