
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui';
import './accessibility.css';

const accessibilitySections = [
  {
    icon: 'visibility',
    heading: 'Clear and Readable Content',
    subheading:
      'We aim to present content with clear headings, readable text and meaningful labels to help visitors navigate the platform.',
  },
  {
    icon: 'keyboard',
    heading: 'Navigation and Usability',
    subheading:
      'We aim to make key pages and actions easy to navigate using available keyboard and assistive technology features.',
  },
  {
    icon: 'devices',
    heading: 'Responsive Experience',
    subheading:
      'MySpaDeal is designed to provide a useful browsing experience across different screen sizes and devices.',
  },
];

export function Accessibility() {
  return (
    <main className="accessibility-page">
      {/* Hero */}
      <section className="accessibility-page__hero">
        <div className="accessibility-page__hero-content">
          <span className="accessibility-page__eyebrow">
            <Icon aria-hidden="true">accessibility_new</Icon>
            ACCESSIBILITY
          </span>

          <h1>Wellness for Everyone</h1>

          <p>
            We believe everyone deserves a comfortable, inclusive
            and accessible wellness experience.
          </p>
        </div>

        <sky-feature-card
          color="primary"
          variant="filled"
          shape="large"
          icon="support_agent"
          iconStyle="surface"
          headline="Need assistance?"
          text="We're here to help make your experience better."
          ctaLabel="Contact Us"
          ctaHref="/contact"
          ctaIcon="arrow_forward"
        />
      </section>

      {/* Accessibility information */}
      <section
        className="accessibility-page__grid"
        aria-label="Our accessibility approach"
      >
        {accessibilitySections.map((section) => (
          <sky-info-card
            key={section.heading}
            icon={section.icon}
            heading={section.heading}
            subheading={section.subheading}
          />
        ))}
      </section>

      {/* Contact CTA */}
      <section
        className="accessibility-page__contact"
        aria-label="Accessibility support"
      >
        <sky-cta-banner
          color="primary"
          icon="support_agent"
          iconStyle="surface"
          headline="Having difficulty using our website?"
          text="Let us know if you encounter an accessibility barrier or need help accessing information on MySpaDeal."
          ctaLabel="Contact Us"
          ctaHref="/contact"
          ctaIcon="arrow_forward"
        />
      </section>
    </main>
  );
}

export default Accessibility;
