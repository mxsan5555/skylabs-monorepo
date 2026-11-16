import { getCatalogHowItWorks } from '../../../api/catalog';
import { useCmsContent } from '../../../hooks/use-cms-content';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { StaticPage, StaticPageLoading } from '../../components/static-page/static-page';
import { howToJsonLd } from '../../seo/jsonld';
import content from '../../../content.json';

const t = content.howItWorks;
/** Same three steps the home page shows, used until the CMS has its own. */
const DEFAULT_STEPS = content.home.howItWorks.steps.map((s) => ({ id: s.title, title: s.title, description: s.text, icon: s.icon }));

/** How it works: CMS hero and ordered steps (`GET /catalog/how-it-works`) over the home page's
 *  default steps. */
export function HowItWorks() {
  const { data, loading } = useCmsContent(getCatalogHowItWorks);
  const title = data?.content.heroTitle || t.title;
  const steps = data && data.steps.length > 0 ? data.steps : DEFAULT_STEPS;

  return (
    <StaticPage
      path={t.path}
      title={title}
      breadcrumb={t.breadcrumb}
      description={data?.content.heroSubtitle || t.description}
      metaTitle={data?.content.metaTitle}
      metaDescription={data?.content.metaDescription}
      schema={howToJsonLd(title, steps.map((s) => ({ name: s.title, text: s.description })))}
      cta={t.cta}
    >
      <PageSection tone="tint" aria-labelledby="how-steps">
        <SectionHead id="how-steps" heading={t.stepsHeading} />
        {loading ? (
          <StaticPageLoading />
        ) : (
          <CardGrid ordered>
            {steps.map((step) => (
              <sky-tile-card
                key={step.id}
                icon={step.icon || t.defaultStepIcon}
                icon-style="tonal"
                headline={step.title}
                text={step.description}
                color="surface"
              />
            ))}
          </CardGrid>
        )}
      </PageSection>
    </StaticPage>
  );
}

export default HowItWorks;
