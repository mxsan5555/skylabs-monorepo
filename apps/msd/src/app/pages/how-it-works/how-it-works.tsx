
import { useEffect, useState } from 'react';
import {getCatalogHowItWorks,type CatalogHowItWorks,} from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import content from '../../../content.json';
import './how-it-works.css';
const howItWorksContent = content.howItWorks;
type FeatureCardColor =| 'tertiary'| 'surface-high'| 'primary'| 'secondary' | 'surface' | 'none'| 'inverse';
type IconStyle = 'surface' | 'filled' | 'tonal' | 'plain';
function isFeatureCardColor(value: string): value is FeatureCardColor {
  return ['tertiary','surface-high','primary','secondary','surface','none','inverse',].includes(value);
}
function isIconStyle(value: string): value is IconStyle {
  return ['surface', 'filled', 'tonal', 'plain'].includes(value);
}
export function HowItWorks() {
  const [howItWorks, setHowItWorks] =useState<CatalogHowItWorks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {let cancelled = false;
    setLoading(true);
    setError('');
    getCatalogHowItWorks()
      .then(({ data }) => {if (!cancelled) {setHowItWorks(data);}})
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiRequestError? err.message: howItWorksContent.error.loadFailed,);
        }
      })
      .finally(() => {if (!cancelled) {setLoading(false);}});
    return () => {cancelled = true;};
  }, []);
  const pageTitle =howItWorks?.content.heroTitle ||howItWorksContent.defaultHeading;
  if (loading) {
    return (
      <main className="how-it-works">
        <title>{howItWorksContent.loading.title}</title>
        <sky-info-card
          icon="hourglass_empty"
          heading={howItWorksContent.loading.heading}
          subheading={howItWorksContent.loading.description}
        />
      </main>
    );
  }
  if (error || !howItWorks) {
    return (
      <main className="how-it-works">
        <title>{howItWorksContent.error.title}</title>
        <sky-info-card
          icon="info"
          heading={howItWorksContent.error.heading}
          subheading={error || howItWorksContent.error.description}
        />
      </main>
    );
  }
  const { content: pageContent, steps } = howItWorks;
  const ctaColor: FeatureCardColor = isFeatureCardColor(howItWorksContent.cta.color,)? howItWorksContent.cta.color: 'secondary';
  const ctaIconStyle: IconStyle = isIconStyle(howItWorksContent.cta.iconStyle,)
    ? howItWorksContent.cta.iconStyle: 'surface';
  return (
    <main className="how-it-works">
      <title>{pageContent.metaTitle ||`${pageTitle}${howItWorksContent.metaTitleSuffix}`}</title>
      <meta
        name="description"
        content={pageContent.metaDescription ||pageContent.heroSubtitle ||howItWorksContent.metaDescription}/>
      <header className="how-it-works__hero">
        <p className="how-it-works__eyebrow">{howItWorksContent.eyebrow}</p>
        <h1>{pageTitle}</h1>
        {pageContent.heroSubtitle && (<p className="how-it-works__subtitle">{pageContent.heroSubtitle}</p>)}
      </header>
      {steps.length === 0 ? (
        <sky-info-card
          icon={howItWorksContent.emptySteps.icon}
          heading={howItWorksContent.emptySteps.heading}
          subheading={howItWorksContent.emptySteps.description}
        />
      ) : (
        <div className="how-it-works__steps">
          {steps.map((step, index) => {
            const configuredColor =howItWorksContent.cardColors[index % howItWorksContent.cardColors.length];
            const cardColor: FeatureCardColor =isFeatureCardColor(configuredColor)? configuredColor: 'tertiary';
            return (
              <div
                key={step.id}
                className={`how-it-works__step-wrap ${index % 2 === 1? 'how-it-works__step-wrap--lower': ''}`}
              >
                <sky-badge variant="primary" size="large">{String(index + 1).padStart(2, '0')}</sky-badge>
                <sky-feature-card
                  color={cardColor}
                  icon={step.icon || howItWorksContent.defaultStepIcon}
                  iconStyle="surface"
                  headline={step.title}
                  text={step.description}
                />
              </div>
            );
          })}
        </div>
      )}
      <div className="how-it-works__cta">
        <sky-cta-banner
          color={ctaColor}
          icon={howItWorksContent.cta.icon}
          icon-style={ctaIconStyle}
          headline={howItWorksContent.cta.heading}
          text={howItWorksContent.cta.description}
          cta-label={howItWorksContent.cta.button}
          cta-href={howItWorksContent.cta.href}
          cta-icon={howItWorksContent.cta.buttonIcon}
        />
      </div>
    </main>
  );
}
export default HowItWorks;
