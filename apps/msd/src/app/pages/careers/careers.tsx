import { useEffect, useState } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import { getCatalogCareers, type CatalogCareers } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import './careers.css';

/** Public Careers page — `GET /catalog/careers` on mount. Renders the singleton
 *  `CareersPageContent` row's hero copy plus every `PUBLISHED` `CareersJobListing`, as saved from
 *  the CMS admin page (`pages/account/cms/careers.tsx`). Each job card shows an "Apply now" link
 *  when `applyUrl` is set, otherwise falls back to the freeform `applyInstructions` text — never
 *  both, matching how the admin form treats them as alternatives. */
export function Careers() {
  const [careers, setCareers] = useState<CatalogCareers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getCatalogCareers()
      .then(({ data }) => {
        if (!cancelled) setCareers(data);
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
      <main className="careers">
        <title>Careers · MSD</title>
        <p className="loading-state">Loading…</p>
      </main>
    );
  }

  if (error || !careers) {
    return (
      <main className="careers">
        <title>Careers · MSD</title>
        <p className="error-state" role="alert">{error || 'This page is not available right now.'}</p>
      </main>
    );
  }

  const { content, jobs } = careers;
  const heading = content.heroTitle || 'Careers';

  return (
    <main className="careers">
      <title>{content.metaTitle || `${heading} · MSD`}</title>
      <meta
        name="description"
        content={content.metaDescription || content.heroSubtitle || 'Explore open roles at MySpaDeal.'}
      />
      <article>
        <header className="careers__hero">
          <h1>{heading}</h1>
          {content.heroSubtitle && <p className="careers__subtitle">{content.heroSubtitle}</p>}
        </header>

        {jobs.length === 0 ? (
          <p className="empty-state">There are no open roles right now — check back soon.</p>
        ) : (
          <section aria-label="Open roles">
            <ul className="careers__list">
              {jobs.map((job) => (
                <li key={job.id}>
                  <sky-card variant="outlined">
                    <article className="job-card">
                      <h2 className="job-card__title">{job.jobTitle}</h2>
                      <p className="job-card__meta">
                        <span className="job-card__meta-item">
                          <Icon aria-hidden="true">apartment</Icon>
                          {job.department}
                        </span>
                        <span className="job-card__meta-item">
                          <Icon aria-hidden="true">location_on</Icon>
                          {job.location}
                        </span>
                        <span className="job-card__meta-item">
                          <Icon aria-hidden="true">work</Icon>
                          {job.employmentType}
                        </span>
                      </p>
                      <p className="job-card__description">{job.description}</p>
                      {job.applyUrl ? (
                        <a
                          className="job-card__apply"
                          href={job.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon aria-hidden="true">open_in_new</Icon>
                          Apply now
                        </a>
                      ) : (
                        job.applyInstructions && (
                          <p className="job-card__apply-instructions">{job.applyInstructions}</p>
                        )
                      )}
                    </article>
                  </sky-card>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}

export default Careers;
