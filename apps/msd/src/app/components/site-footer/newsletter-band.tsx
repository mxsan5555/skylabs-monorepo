import { useEffect, useId, useRef, useState } from 'react';
import content from '../../../content.json';

const t = content.nav.footer;

/** Newsletter signup. UI only for now: no request is sent (TASK.md backlog tracks the backend).
 *  `sky-action-field` uses native email + required validation, so submit only fires when valid.
 *  The field stays mounted (cleared) and focus moves to the always-present live region. */
export function NewsletterBand() {
  const headingId = useId();
  const [done, setDone] = useState(false);
  const fieldRef = useRef<HTMLElement & { value: string }>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (done) statusRef.current?.focus();
  }, [done]);

  return (
    <section className="newsletter-band" aria-labelledby={headingId}>
      <div className="newsletter-band__inner">
        <div className="newsletter-band__copy">
          <h2 id={headingId} className="title-large">{t.headings.newsletter}</h2>
          <p className="body-medium">{t.newsletter.sub}</p>
        </div>
        <div className="newsletter-band__form">
          <sky-action-field
            ref={fieldRef}
            type="email"
            name="email"
            autocomplete="email"
            required
            icon="mail"
            variant="outlined"
            label={t.newsletter.emailLabel}
            action-label={t.newsletter.submitLabel}
            onsky-submit={(e) => {
              if (!e.detail.value) return;
              if (fieldRef.current) fieldRef.current.value = '';
              setDone(true);
            }}
          />
          <p ref={statusRef} role="status" tabIndex={-1} className="newsletter-band__status body-large">
            {done ? t.newsletter.successMessage : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
