import {
  FilledButton,
  OutlinedTextField,
  Icon,
} from "@skylabs-monorepo/shared-ui/react";
import "./contact.css";
import { useState } from "react";
import { copy } from "../../../copy/copy";
export function Contact() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const validatePhone = (value: string) =>
    /^[6-9]\d{9}$/.test(value);
  return (
    <div className="contact">
      <main className="contact-page">

        {/* Hero */}
        <section className="contact-hero">
          <span className="contact-hero__badge">
            <Icon>support_agent</Icon>
            {copy.contact.hero.badge}
          </span>
          <h1>{copy.contact.hero.title}</h1>
          <p>{copy.contact.hero.description}</p>
        </section>

        {/* Form + Contact Info */}
        <section className="contact-content">
          {/* Contact Form */}
          <div className="contact-form">
            <h2>{copy.contact.form.title}</h2>
            <p>{copy.contact.form.description}</p>

            <div className="contact-form-grid">
              <OutlinedTextField label="Full Name" className="contact-field" />

              <div className="contact-field-wrapper">
                <OutlinedTextField
                  label="Email Address"
                  type="email"
                  className="contact-field"
                  value={email}
                  onInput={(e: Event) => {
                    const value = (e.target as HTMLInputElement).value;
                    setEmail(value);

                    if (!validateEmail(value)) {
                      setEmailError(copy.contact.errors.invalidEmail);
                    } else {
                      setEmailError("");
                    }
                  }}
                />

                {emailError && (
                  <p className="contact-error">{emailError}</p>
                )}
              </div>

              <div className="contact-field-wrapper">
                <OutlinedTextField
                  label="Phone Number"
                  type="tel"
                  className="contact-field"
                  value={phone}
                  onInput={(e: Event) => {
                    let value = (e.target as HTMLInputElement).value;

                    value = value.replace(/\D/g, "");
                    value = value.slice(0, 10);

                    (e.target as HTMLInputElement).value = value;
                    setPhone(value);

                    if (!validatePhone(value)) {
                      setPhoneError(copy.contact.errors.invalidPhone);
                    } else {
                      setPhoneError("");
                    }
                  }}
                />

                {phoneError && (
                  <p className="contact-error">{phoneError}</p>
                )}
              </div>

              <OutlinedTextField
                label="Subject"
                className="contact-field"
              />

              <OutlinedTextField
                label="Message"
                rows={4}
                type="textarea"
                className="contact-field contact-message"
              />

              <FilledButton
                className="contact-btn"
                onClick={() => {

                  if (!validateEmail(email)) {
                    setEmailError(copy.contact.errors.invalidEmail);
                    return;
                  }

                  if (!validatePhone(phone)) {
                    setPhoneError(copy.contact.errors.invalidPhone);
                    return;
                  }

                  alert(copy.contact.form.successMessage);

                }}
              >
                Send Message
              </FilledButton>
            </div>

          </div>

          {/* Contact Information */}
          <aside className="contact-info">
            <h2>{copy.contact.info.title}</h2>
            <div className="info-item">
              <div className="icon-box">
                <Icon>location_on</Icon>
              </div>

              <div>
                <h4>{copy.contact.info.visitTitle}</h4>
                <p>
                  {copy.contact.info.visitAddress[0]}
                  <br />
                  {copy.contact.info.visitAddress[1]}
                  <br />
                  {copy.contact.info.visitAddress[2]}
                </p>
              </div>
            </div>

            <div className="info-item">
              <div className="icon-box">
                <Icon>call</Icon>
              </div>

              <div>
                <h4>{copy.contact.info.phoneTitle}</h4>
                <p>{copy.contact.info.phone}</p>
              </div>
            </div>

            <div className="info-item">

              <div className="icon-box">
                <Icon>mail</Icon>
              </div>

              <div>
                <h4>{copy.contact.info.emailTitle}</h4>
                <p>{copy.contact.info.email}</p>
              </div>
            </div>

            <div className="info-item">

              <div className="icon-box">
                <Icon>schedule</Icon>
              </div>

              <div>
                <h4>{copy.contact.info.hoursTitle}</h4>
                <p>  {copy.contact.info.hours}</p>
              </div>
            </div>
          </aside>
        </section>

        {/* Google Map */}
        <section className="contact-map">
          <div className="contact-map__header">
            <h2>{copy.contact.map.title}</h2>
            <p>{copy.contact.map.description}</p>
          </div>

          <div className="contact-map__frame">
            <iframe
              title="MSD Wellness Center"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d21638.986883902402!2d77.29389627564338!3d28.596552017049838!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390ce45a12ed6e5b%3A0x7e9f560d01f7f94e!2sV2%20Infotech-%20Website%20Design%20and%20Development%20Company!5e1!3m2!1sen!2sin!4v1782898896066!5m2!1sen!2sin"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>

        {/* <section className="showcase">

          <div className="contact-card">
            <div className="icon-box">
              <Icon>call</Icon>
            </div>

            <h3>Call Us</h3>

            <p>Speak directly with our support team.</p>

            <span>+91 98765 43210</span>
          </div>

          <div className="contact-card">
            <div className="icon-box">
              <Icon>mail</Icon>
            </div>

            <h3>Email Us</h3>

            <p>Send us your questions anytime.</p>

            <span>support@msd.com</span>
          </div>

          <div className="contact-card">
            <div className="icon-box">
              <Icon>location_on</Icon>
            </div>

            <h3>Visit Us</h3>

            <p>Come experience our wellness center.</p>

            <span>DLF Phase 4, Gurugram</span>
          </div>

        </section> */}
      </main>
    </div>
  );
}

export default Contact;