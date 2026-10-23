import { createElement } from 'react';
import { getCatalogCareers } from '../../../api/catalog';
import { useCmsContent } from '../../../hooks/use-cms-content';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { StaticPage, StaticPageLoading } from '../../components/static-page/static-page';
import { fillTemplate } from '../../../utils/format';
import content from '../../../content.json';

const t = content.careers;

/** Careers: CMS hero and every published job (`GET /catalog/careers`). A job shows an Apply now
 *  link when it has `applyUrl`, otherwise its `applyInstructions` text. */
export function Careers() {
  const { data, loading } = useCmsContent(getCatalogCareers);
  const jobs = data?.jobs ?? [];

  return (
    <StaticPage
      path={t.path}
      title={data?.content.heroTitle || t.title}
      breadcrumb={t.breadcrumb}
      description={data?.content.heroSubtitle || t.description}
      metaTitle={data?.content.metaTitle}
      metaDescription={data?.content.metaDescription}
      cta={t.cta}
    >
      <PageSection tone="tint" aria-labelledby="careers-jobs">
        <SectionHead id="careers-jobs" heading={t.jobsHeading} />
        {loading ? (
          <StaticPageLoading />
        ) : jobs.length === 0 ? (
          <p className="body-large text-muted">{t.empty}</p>
        ) : (
          <CardGrid layout="list">
            {jobs.map((job) => (
              <sky-card key={job.id} variant="outlined">
                <article className="prose body-large" aria-labelledby={`job-${job.id}`}>
                  <h3 id={`job-${job.id}`}>{job.jobTitle}</h3>
                  <p className="body-medium text-muted">
                    {[job.department, job.location, job.employmentType].filter(Boolean).join(' · ')}
                  </p>
                  <p>{job.description}</p>
                  {job.responsibilities && (
                    <>
                      <h4>{t.responsibilities}</h4>
                      <p>{job.responsibilities}</p>
                    </>
                  )}
                  {job.requirements && (
                    <>
                      <h4>{t.requirements}</h4>
                      <p>{job.requirements}</p>
                    </>
                  )}
                  {job.applyUrl ? (
                    createElement('md-filled-button', { href: job.applyUrl, 'aria-label': fillTemplate(t.applyLabel, { title: job.jobTitle }) }, t.apply)
                  ) : (
                    job.applyInstructions && <p>{job.applyInstructions}</p>
                  )}
                </article>
              </sky-card>
            ))}
          </CardGrid>
        )}
      </PageSection>
    </StaticPage>
  );
}

export default Careers;
