import type { ReactNode } from 'react';
import type { BlogBlock } from '../../../types';
import { Breadcrumb } from '../breadcrumb';
import { PageSection } from '../page-section/page-section';
import { SectionHead } from '../section-head/section-head';
import { renderBlock } from '../blog-blocks/blog-blocks';
import { Seo } from '../../seo/seo';
import { breadcrumbJsonLd, webPageJsonLd, type JsonLdObject } from '../../seo/jsonld';
import { SITE_URL, absoluteUrl } from '../../seo/site-url';
import { fillTemplate, formatLongDate } from '../../../utils/format';
import { PageHeadLogo } from '../section-head/page-head-logo';
import content from '../../../content.json';

const t = content.staticPage;

export interface StaticPageCta {
  icon: string;
  heading: string;
  text: string;
  label: string;
  href: string;
}

export interface StaticPageProps {
  /** Route path, for the canonical URL and breadcrumb JSON-LD. */
  path: string;
  /** The h1. */
  title: string;
  /** Last breadcrumb label; defaults to the title. */
  breadcrumb?: string;
  /** Intro under the h1 and the default meta description. */
  description: string;
  /** CMS SEO overrides. */
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** ISO date shown as "Last updated" (legal pages). */
  updatedAt?: string;
  /** Main schema.org entity; defaults to a WebPage. */
  schema?: JsonLdObject;
  /** Closing banner; defaults to the Help Center prompt, `null` hides it. */
  cta?: StaticPageCta | null;
  children?: ReactNode;
}

/** Shared frame for every static content page (About, Contact, Help, legal, ...): SEO head and
 *  JSON-LD, a header band (breadcrumb, h1, intro), the page's own bands, and one closing CTA. */
export function StaticPage({
  path,
  title,
  breadcrumb = title,
  description,
  metaTitle,
  metaDescription,
  updatedAt,
  schema,
  cta = t.cta,
  children,
}: StaticPageProps) {
  const url = absoluteUrl(path);
  const metaDesc = metaDescription || description;
  // Absolute-URL entities need VITE_SITE_URL; FAQPage / HowTo schemas do not.
  const main = schema ?? (url && webPageJsonLd({ name: title, description: metaDesc, url, dateModified: updatedAt }));
  const crumbs = url && breadcrumbJsonLd(SITE_URL, [{ name: t.home, path: '/' }, { name: breadcrumb, path }]);
  const jsonLd = [main, crumbs].filter((x): x is JsonLdObject => !!x);

  return (
    <>
      <Seo title={metaTitle || `${title}${t.titleSuffix}`} description={metaDesc} path={path} jsonLd={jsonLd.length > 0 ? jsonLd : undefined} />
      <PageSection stack aria-labelledby="page-heading">
        <Breadcrumb items={[{ label: t.home, to: '/' }, { label: breadcrumb }]} />
        <SectionHead as="h1" id="page-heading" titleClassName="headline-large" heading={title} subheading={description} media={<PageHeadLogo />} />
        {updatedAt && (
          <p className="body-medium text-muted">
            <time dateTime={updatedAt}>
              {fillTemplate(t.updated, { date: formatLongDate(updatedAt) })}
            </time>
          </p>
        )}
      </PageSection>
      {children}
      {cta && (
        <PageSection aria-label={cta.heading}>
          <sky-cta-banner
            color="primary"
            icon={cta.icon}
            icon-style="surface"
            headline={cta.heading}
            text={cta.text}
            cta-label={cta.label}
            cta-href={cta.href}
            cta-icon="arrow_forward"
          />
        </PageSection>
      )}
    </>
  );
}

/** CMS body blocks (or a content.json fallback) as readable long-form text. */
export function Prose({ blocks }: { blocks: BlogBlock[] }) {
  return <div className="prose body-large">{blocks.map(renderBlock)}</div>;
}

/** Loading line for a page band while its CMS content is on the way. */
export function StaticPageLoading() {
  return (
    <p className="loading-state" role="status">
      {t.loading}
    </p>
  );
}
