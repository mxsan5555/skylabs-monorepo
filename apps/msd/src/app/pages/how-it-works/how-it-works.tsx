import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { getCatalogHowItWorks, type CatalogHowItWorks } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import './how-it-works.css';

/** Public How It Works page — `GET /catalog/how-it-works` on mount. Renders the singleton
 *  `HowItWorksContent` row's hero copy plus every active `HowItWorksStep`, ordered by
 *  `sortOrder`, as saved from the CMS admin page (`pages/account/cms/how-it-works.tsx`). A step
 *  shows its chosen Material Symbols icon when set, otherwise falls back to its position number. */
export function HowItWorks() {
  const [howItWorks, setHowItWorks] = useState<CatalogHowItWorks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getCatalogHowItWorks()
      .then(({ data }) => {
        if (!cancelled) setHowItWorks(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'Could not load this page.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="how-it-works">
        <title>How It Works · MSD</title>
        <p className="loading-state">Loading…</p>
      </main>
    );
  }

  if (error || !howItWorks) {
    return (
      <main className="how-it-works">
        <title>How It Works · MSD</title>
        <p className="error-state" role="alert">{error || 'This page is not available right now.'}</p>
      </main>
    );
  }

  const { content, steps } = howItWorks;
  const heading = content.heroTitle || 'How It Works';

  return (
    <main className="how-it-works">
      <title>{content.metaTitle || `${heading} · MSD`}</title>
      <meta
        name="description"
        content={content.metaDescription || content.heroSubtitle || 'See how booking with MySpaDeal works.'}
      />
      <article>
        <header className="how-it-works__hero">
          <h1>{heading}</h1>
          {content.heroSubtitle && <p className="how-it-works__subtitle">{content.heroSubtitle}</p>}
        </header>

        {steps.length === 0 ? (
          <p className="empty-state">Steps are coming soon.</p>
        ) : (
          <ol className="how-it-works__steps">
            {steps.map((step, i) => (
              <li key={step.id} className="how-it-works__step">
                <span className="how-it-works__step-icon" aria-hidden="true">
                  {step.icon ? <Icon aria-hidden="true">{step.icon}</Icon> : i + 1}
                </span>
                <div className="how-it-works__step-body">
                  <h2 className="how-it-works__step-title">{step.title}</h2>
                  <p className="how-it-works__step-description">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </article>
    </main>
  );
}

export default HowItWorks;
