import { Icon } from '@skylabs-monorepo/shared-ui/react';
import type { CatalogContactUs } from '../../../api/catalog';
import content from '../../../content.json';
import './contact-details.css';

const t = content.contact;
const d = t.defaults;

export interface ContactDetail {
  icon: string;
  label: string;
  value: string;
  /** `tel:` / `mailto:` link; the value renders as plain text without it. */
  href?: string;
}

/** Address, phone and email as one `<address>` list of icon + label + value rows. */
export function ContactDetails({ items }: { items: ContactDetail[] }) {
  if (items.length === 0) return null;
  return (
    <address className="contact-details">
      <ul className="contact-details__list">
        {items.map((item) => (
          <li key={item.label} className="contact-details__item">
            <span className="contact-details__icon">
              <Icon aria-hidden="true">{item.icon}</Icon>
            </span>
            <span className="contact-details__text">
              <span className="label-large">{item.label}</span>
              {item.href ? (
                <a
                  className="contact-details__value text-link body-large"
                  href={item.href}
                >
                  {item.value}
                </a>
              ) : (
                <span className="contact-details__value body-large">
                  {item.value}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </address>
  );
}

/** Contact details shown on Contact and Become a member: CMS values (`GET /catalog/contact-us`)
 *  over the content.json defaults, plus a map URL (CMS embed, else a keyless Google Maps embed of
 *  the address). */
export function contactInfo(data: CatalogContactUs | null) {
  const address = data?.address || d.address;
  const phone = data?.phone || d.phone;
  const email = data?.email || d.email;
  const items: ContactDetail[] = [
    address && { icon: 'location_on', label: t.address, value: address },
    phone && {
      icon: 'call',
      label: t.phone,
      value: phone,
      href: `tel:${phone.replace(/\s+/g, '')}`,
    },
    email && {
      icon: 'mail',
      label: t.email,
      value: email,
      href: `mailto:${email}`,
    },
  ].filter((x): x is ContactDetail => !!x);
  const mapUrl =
    data?.mapEmbedUrl ||
    (address
      ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
      : '');
  return { items, email, mapUrl };
}
