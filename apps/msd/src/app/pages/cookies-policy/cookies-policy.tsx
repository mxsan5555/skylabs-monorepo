
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui';
import './cookies-policy.css';

const cookieSections = [
  {
    icon: 'info',
    heading: 'What Are Cookies?',
    subheading:
      'Cookies are small files stored on your device that help websites remember information and support certain website features.',
  },
  {
    icon: 'settings',
    heading: 'How Cookies May Be Used',
    subheading:
      'Cookies may support essential website functions, remember preferences, improve performance and help understand website usage, depending on the technologies enabled.',
  },
  {
    icon: 'tune',
    heading: 'Managing Cookies',
    subheading:
      'You can manage or delete cookies through your browser settings. Blocking certain cookies may affect how some website features work.',
  },
];

export function CookiesPolicy() {
  return (
    <main className="cookies-page">
      <section className="cookies-page__hero">
        <span className="cookies-page__eyebrow">
          MY SPA DEAL · COOKIE POLICY
        </span>

        <h1>A little clarity about cookies.</h1>

        <p>
          Learn what cookies are, how they may support your
          experience on MySpaDeal and how you can manage them.
        </p>

        <div className="cookies-page__updated">
          <Icon aria-hidden="true">cookie</Icon>
          <span>Last updated: 21/10/2026</span>
        </div>
      </section>

      <section
        className="cookies-page__grid"
        aria-label="Cookie policy information"
      >
        {cookieSections.map((section) => (
          <sky-info-card
            key={section.heading}
            icon={section.icon}
            heading={section.heading}
            subheading={section.subheading}
          />
        ))}
      </section>

      <section
        className="cookies-page__contact"
        aria-label="Cookie policy support"
      >
        <sky-cta-banner
          color="primary"
          icon="support_agent"
          iconStyle="surface"
          headline="Questions about cookies?"
          text="Contact our team if you have questions about cookies or how information is used on MySpaDeal."
          ctaLabel="Contact Us"
          ctaHref="/contact"
          ctaIcon="arrow_forward"
        />
      </section>
    </main>
  );
}

export default CookiesPolicy;
