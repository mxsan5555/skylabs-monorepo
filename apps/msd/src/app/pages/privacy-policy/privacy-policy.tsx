
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui';
import './privacy-policy.css';

const privacySections = [
  {
    icon: 'database',
    heading: 'Information We Collect',
    subheading:
      'We may collect your name, contact details, account information, bookings, orders and relevant technical data.',
  },
  {
    icon: 'lock',
    heading: 'How We Use Your Data',
    subheading:
      'We use information to manage your account, process bookings and orders, respond to enquiries and maintain security.',
  },
  {
    icon: 'groups',
    heading: 'When We Share Information',
    subheading:
      'Relevant details may be shared with service providers, payment partners and businesses when needed to fulfil your requests.',
  },
  {
    icon: 'shield',
    heading: 'Security and Retention',
    subheading:
      'We take appropriate measures to protect information and retain it only as needed for its purpose or applicable legal requirements.',
  },
];

export function PrivacyPolicy() {
  return (
    <main className="privacy-policy">
      <section className="privacy-policy__hero">
        <span className="privacy-policy__eyebrow">
          MY SPA DEAL · PRIVACY
        </span>

        <h1>Your privacy, our priority.</h1>

        <p>
          We believe in being transparent about how your information is
          collected, used and protected when you explore and book wellness
          services with MySpaDeal.
        </p>

        <div className="privacy-policy__updated">
          <Icon aria-hidden="true">verified_user</Icon>
          <span>Last updated: 17 October 2026</span>
        </div>
      </section>

      <section
        className="privacy-policy__grid"
        aria-label="Privacy details"
      >
        {privacySections.map((section) => (
          <sky-info-card
            key={section.heading}
            icon={section.icon}
            heading={section.heading}
            subheading={section.subheading}
          />
        ))}
      </section>


      <section
        className="privacy-policy__contact"
        aria-label="Privacy support"
      >
        <sky-cta-banner
          color="primary"
          icon="support_agent"
          iconStyle="surface"
          headline="Have a privacy-related question?"
          text="Contact our team for help with your personal information or privacy requests."
          ctaLabel="Contact Us"
          ctaHref="/contact"
          ctaIcon="arrow_forward"
        />
      </section>
    </main>
  );
}

export default PrivacyPolicy;
