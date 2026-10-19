import { Icon, FilledButton, OutlinedTextField, } from '@skylabs-monorepo/shared-ui/react';
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
      <section className="accessibility-page__hero">
        <span className="accessibility-page__eyebrow">
          MY SPA DEAL · ACCESSIBILITY
        </span>

        <h1>Wellness should be accessible to everyone.</h1>

        <p>
          We aim to make exploring wellness services and products
          on MySpaDeal clear, usable and welcoming for everyone.
        </p>

        <div className="accessibility-page__note">
          <Icon>accessibility_new</Icon>
          <span>Our commitment to a more inclusive experience</span>
        </div>
      </section>

      <section
        className="accessibility-page__grid"
        aria-label="Accessibility approach"
      >
        {accessibilitySections.map((section) => (
          <sky-info-card
            key={section.heading}
            icon={section.icon}
            heading={section.heading}
            subheading={section.subheading}
          ></sky-info-card>
        ))}
      </section>

      <section className="accessibility-page__contact">
        <div>
          <h2>Having difficulty using our website?</h2>
          <p>
            Let us know if you encounter an accessibility barrier
            or need help accessing information on MySpaDeal.
          </p>
        </div>

        <a
          href="/contact"
          className="accessibility-page__contact-link"
        >
          Contact Us
          <Icon>arrow_forward</Icon>
        </a>
      </section>
    </main>
  );
}

export default Accessibility;
