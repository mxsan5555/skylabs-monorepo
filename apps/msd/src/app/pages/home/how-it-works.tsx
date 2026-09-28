import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { SectionHead } from '../../components/section-head/section-head';
import { PageSection } from '../../components/page-section/page-section';
import content from '../../../content.json';

const t = content.home.howItWorks;

/** Three short steps: plain, quotable answer content for AI answer engines (AEO). */
export function HowItWorks() {
  return (
    <PageSection aria-labelledby="how-heading">
      <SectionHead id="how-heading" heading={t.heading} subheading={t.subheading} />
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
    </PageSection>
  );
}
