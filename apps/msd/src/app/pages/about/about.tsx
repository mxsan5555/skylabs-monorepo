import { getCatalogAboutUs } from '../../../api/catalog';
import { resolveMediaUrl } from '../../../api/media';
import { useCmsContent } from '../../../hooks/use-cms-content';
import { CardGrid } from '../../components/card-grid/card-grid';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { Prose, StaticPage } from '../../components/static-page/static-page';
import { webPageJsonLd } from '../../seo/jsonld';
import { absoluteUrl } from '../../seo/site-url';
import content from '../../../content.json';

const t = content.about;

/** About us: CMS hero, mission and story (`GET /catalog/about-us`) over content.json defaults,
 *  plus what customers can do and the partner prompt. */
export function About() {
  const { data } = useCmsContent(getCatalogAboutUs);
  const title = data?.heroTitle || t.title;
  const description = data?.heroSubtitle || t.description;
  const image = data?.mediaImages.find((m) => m.isPrimary) ?? data?.mediaImages[0];
  const url = absoluteUrl(t.path);

  return (
    <StaticPage
      path={t.path}
      title={title}
      breadcrumb={t.breadcrumb}
      description={description}
      metaTitle={data?.metaTitle}
      metaDescription={data?.metaDescription}
      schema={url ? webPageJsonLd({ type: 'AboutPage', name: title, description, url }) : undefined}
      cta={t.cta}
    >
      {image && (
        <PageSection flush>
          <sky-image src={resolveMediaUrl(image.storageKey)} alt="" ratio="21 / 9" fit="cover" shape="extra-large" />
        </PageSection>
      )}
      <PageSection tone="tint" aria-labelledby="about-offer">
        <SectionHead id="about-offer" heading={t.offer.heading} />
        <CardGrid>
          {t.offer.items.map((item) => (
            <sky-tile-card key={item.heading} icon={item.icon} icon-style="tonal" headline={item.heading} text={item.text} color="surface" />
          ))}
        </CardGrid>
      </PageSection>
      {data && (data.missionStatement || data.body.length > 0) && (
        <PageSection stack aria-labelledby="about-story">
          <SectionHead id="about-story" heading={t.story} />
          {data.missionStatement && <p className="prose title-large">{data.missionStatement}</p>}
          {data.body.length > 0 && <Prose blocks={data.body} />}
        </PageSection>
      )}
    </StaticPage>
  );
}

export default About;
