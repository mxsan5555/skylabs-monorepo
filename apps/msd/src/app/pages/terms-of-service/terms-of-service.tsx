
import '@skylabs-monorepo/shared-ui';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import './terms-of-service.css';

const termsSections = [
  {
    icon: 'handshake',
    heading: 'Acceptance of Terms',
    subheading:
      'By accessing or using MySpaDeal, you agree to these Terms of Service and applicable policies.',
  },
  {
    icon: 'calendar-check',
    heading: 'Bookings and Orders',
    subheading:
      'Bookings and orders are subject to availability, confirmation and the details shown at checkout.',
  },
  {
    icon: 'credit-card',
    heading: 'Payments and Pricing',
    subheading:
      'The applicable price and charges will be shown before you place an order. Payments are processed through the available payment methods.',
  },
  {
    icon: 'refresh-cw',
    heading: 'Cancellations and Refunds',
    subheading:
      'Cancellation eligibility, timelines and refunds are governed by the applicable policy shown for your booking or order.',
  },
  {
    icon: 'user-round',
    heading: 'Customer Responsibilities',
    subheading:
      'You must provide accurate information, protect your account credentials and use the platform lawfully.',
  },
  {
    icon: 'shield-check',
    heading: 'Platform Use and Changes',
    subheading:
      'Do not misuse the platform. Terms may be updated, and material changes should be communicated as required by applicable law.',
  },
];

export function TermsOfService() {
  return (
    <main className="terms-page">
      <section className="terms-page__hero">
        <span className="terms-page__eyebrow">
          MY SPA DEAL · LEGAL
        </span>

        <h1>Simple terms. Clear expectations.</h1>

        <p>
          Please review the terms for using MySpaDeal, booking
          wellness services and purchasing products.
        </p>

        <div className="terms-page__updated">
          <Icon aria-hidden="true">description</Icon>
          <span>Last updated: [publication date]</span>
        </div>
      </section>

      <section
        className="terms-page__grid"
        aria-label="Terms of Service sections"
      >
        {termsSections.map((section) => (
          <sky-info-card
            key={section.heading}
            icon={section.icon}
            heading={section.heading}
            subheading={section.subheading}
          />
        ))}
      </section>

      <section
        className="terms-page__contact"
        aria-label="Terms support"
      >
        <sky-cta-banner
          color="primary"
          icon="support_agent"
          iconStyle="surface"
          headline="Questions about our terms?"
          text="Contact our team for clarification about your booking, order or use of the platform."
          ctaLabel="Contact Us"
          ctaHref="/contact"
          ctaIcon="arrow_forward"
        />
      </section>
    </main>
  );
}

export default TermsOfService;
