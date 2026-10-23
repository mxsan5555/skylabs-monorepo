import { useMemo, useRef, useState } from 'react';
import { TextButton } from '@skylabs-monorepo/shared-ui/react';
import { listCatalogFaqs } from '../../../api/catalog';
import { useCmsContent } from '../../../hooks/use-cms-content';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { StaticPage, StaticPageLoading } from '../../components/static-page/static-page';
import { faqPageJsonLd } from '../../seo/jsonld';
import { fillTemplate } from '../../../utils/format';
import content from '../../../content.json';

const t = content.helpCenter;

/** Help Center: searchable FAQ accordion. CMS FAQs (`GET /catalog/faqs`) replace the content.json
 *  defaults once any exist; the full list ships as FAQPage JSON-LD. */
export function HelpCenter() {
  const { data, loading } = useCmsContent(listCatalogFaqs);
  const faqs = data && data.length > 0 ? data : t.faqs;
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLElement>(null);
  useCustomEvent<{ value: string }>(searchRef, 'sky-submit', (e) => setQuery(e.detail.value));

  const matches = useMemo(() => {
    const q = query.toLowerCase();
    return q ? faqs.filter((f) => `${f.question} ${f.answer}`.toLowerCase().includes(q)) : faqs;
  }, [faqs, query]);

  const resultText = !query
    ? ''
    : matches.length === 0
      ? fillTemplate(t.noResults, { query })
      : fillTemplate(matches.length === 1 ? t.resultCountOne : t.resultCount, { count: String(matches.length), query });

  const clear = () => {
    setQuery('');
    if (searchRef.current) (searchRef.current as HTMLElement & { value: string }).value = '';
  };

  return (
    <StaticPage
      path={t.path}
      title={t.title}
      breadcrumb={t.breadcrumb}
      description={t.description}
      schema={faqPageJsonLd(faqs)}
      cta={t.cta}
    >
      <PageSection tone="tint" stack aria-labelledby="help-faqs">
        <SectionHead
          id="help-faqs"
          heading={t.faqsHeading}
          actions={
            <sky-action-field
              ref={searchRef}
              role="search"
              type="search"
              enterkeyhint="search"
              icon={t.search.icon}
              label={t.search.label}
              placeholder={t.search.placeholder}
              action-label={t.search.action}
              variant="outlined"
              dense
            />
          }
        />
        <p className="body-medium text-muted" aria-live="polite">
          {resultText}
        </p>
        {query && (
          <div>
            <TextButton onClick={clear}>{t.showAll}</TextButton>
          </div>
        )}
        {loading ? (
          <StaticPageLoading />
        ) : (
          matches.length > 0 && (
            <sky-accordion>
              {matches.map((faq) => (
                <sky-accordion-item key={faq.question} header={faq.question} level={3}>
                  <p className="prose body-large">{faq.answer}</p>
                </sky-accordion-item>
              ))}
            </sky-accordion>
          )
        )}
      </PageSection>
    </StaticPage>
  );
}

export default HelpCenter;
