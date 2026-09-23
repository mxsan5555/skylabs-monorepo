import { Icon } from '@skylabs-monorepo/shared-ui/react';
import content from '../../../content.json';

const t = content.home.howItWorks;

/** Three short steps: plain, quotable answer content for AI answer engines (AEO). */
export function HowItWorks() {
  return (
    <section className="home-band" aria-labelledby="how-heading">
      <div className="home-container">
        <div className="home-head home-head--stack">
          <h2 id="how-heading" className="headline-small">{t.heading}</h2>
          <p className="home-head__sub body-large">{t.subheading}</p>
        </div>
        <ol className="home-steps">
          {t.steps.map((step) => (
            <li key={step.title} className="home-steps__item">
              <span className="home-steps__icon" aria-hidden="true">
                <Icon>{step.icon}</Icon>
              </span>
              <h3 className="title-medium">{step.title}</h3>
              <p className="body-medium">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
