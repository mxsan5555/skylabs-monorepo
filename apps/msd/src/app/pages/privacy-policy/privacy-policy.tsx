import '@skylabs-monorepo/shared-ui';
import './privacy-policy.css';
import { Icon, FilledButton, OutlinedTextField, } from '@skylabs-monorepo/shared-ui/react';
export function PrivacyPolicy() {
  return (
    <main className="privacy-policy">
      <section className="privacy-policy__hero">
        <span className="privacy-policy__eyebrow">MY SPA DEAL · PRIVACY</span>

        <h1>Your privacy, our priority.</h1>

        <p>
          We believe in being transparent about how your information is
          collected, used and protected when you explore and book wellness
          services with MySpaDeal.
        </p>

        <div className="privacy-policy__updated">
          <Icon>verified_user</Icon>
          <span>Last updated: 17 October 2026</span>
        </div>
      </section>

      <section className="privacy-policy__grid" aria-label="Privacy details">
        <sky-info-card
          icon="database"
          heading="Information We Collect"
          subheading="We may collect your name, contact details, account information, bookings, orders and relevant technical data."
        ></sky-info-card>

        <sky-info-card
          icon="lock"
          heading="How We Use Your Data"
          subheading="We use information to manage your account, process bookings and orders, respond to enquiries and maintain security."
        ></sky-info-card>

        <sky-info-card
          icon="groups"
          heading="When We Share Information"
          subheading="Relevant details may be shared with service providers, payment partners and businesses when needed to fulfil your requests."
        ></sky-info-card>

        <sky-info-card
          icon="shield"
          heading="Security and Retention"
          subheading="We take appropriate measures to protect information and retain it only as needed for its purpose or applicable legal requirements."
        ></sky-info-card>
      </section>

      <section className="privacy-policy__rights">
        <div className="privacy-policy__rights-icon">
          <Icon>manage_accounts</Icon>
        </div>

        <div className="privacy-policy__rights-content">
          <h2>Your privacy choices</h2>
          <p>
            Depending on applicable law, you may request access to or
            correction or deletion of your personal information, withdraw
            consent where applicable, or raise a privacy grievance.
          </p>
          <p>
            Cookies and third-party services may also process information
            under their applicable policies.
          </p>
        </div>
      </section>

      <section className="privacy-policy__contact">
        <div>
          <h2>Have a privacy-related question?</h2>
          <p>
            Contact our team for help with your personal information or
            privacy requests.
          </p>
        </div>

        <a href="/contact" className="privacy-policy__contact-link">
          Contact Us
          <Icon>arrow_forward</Icon>
        </a>
      </section>
    </main>
  );
}

export default PrivacyPolicy;