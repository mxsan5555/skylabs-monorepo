import { useState } from 'react';
import content from '../../../content.json';

const t = content.nav.footer;

/** Newsletter signup. UI only for now: no request is sent (TASK.md backlog tracks the backend).
 *  `sky-action-field` uses native email + required validation, so submit only fires when valid. */
export function NewsletterBand() {
  const [done, setDone] = useState(false);
  return (
    <section className="newsletter-band" aria-labelledby="newsletter-heading">
      <div className="newsletter-band__inner">
        <div className="newsletter-band__copy">
          <h2 id="newsletter-heading" className="title-large">{t.headings.newsletter}</h2>
          <p className="body-medium">{t.newsletter.sub}</p>
        </div>
        <div className="newsletter-band__form">
          {!done && (
            <sky-action-field
              type="email"
              name="email"
              autocomplete="email"
              required
              icon="mail"
              variant="outlined"
              label={t.newsletter.emailLabel}
              action-label={t.newsletter.submitLabel}
              onsky-submit={(e) => {
                if (e.detail.value) setDone(true);
              }}
            />
          )}
          <p role="status" className="newsletter-band__status body-large">
            {done ? t.newsletter.successMessage : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
