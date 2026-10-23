import { getCatalogPage } from '../../../api/catalog';
import type { BlogBlock } from '../../../types';
import { useCmsContent } from '../../../hooks/use-cms-content';
import { PageSection } from '../../components/page-section/page-section';
import { Prose, StaticPage, StaticPageLoading } from '../../components/static-page/static-page';
import content from '../../../content.json';

const t = content.legalPages;

export type LegalPageKey = 'privacy' | 'terms' | 'accessibility' | 'cookies';

/** The seeded rows only hold "Content coming soon.", which must not replace the real default. */
const isPlaceholder = (blocks: BlogBlock[]) =>
  blocks.length === 0 || (blocks.length === 1 && 'text' in blocks[0] && blocks[0].text === t.placeholder);

/** One page for the four fixed legal `WebsitePage` rows (privacy/terms/accessibility/cookies):
 *  the CMS body (`GET /catalog/pages/:slug`, slug = `page`) once an admin writes one, otherwise
 *  the content.json default. */
export function WebsitePage({ page }: { page: LegalPageKey }) {
  const fallback = t[page];
  const { data, loading } = useCmsContent(getCatalogPage, page);
  const cms = data && !isPlaceholder(data.content) ? data : null;

  return (
    <StaticPage
      path={fallback.path}
      title={cms?.title || fallback.title}
      description={fallback.description}
      metaTitle={cms?.metaTitle}
      metaDescription={cms?.metaDescription}
      updatedAt={cms?.updatedAt}
    >
      <PageSection tone="tint">
        {loading ? <StaticPageLoading /> : <Prose blocks={cms ? cms.content : (fallback.body as BlogBlock[])} />}
      </PageSection>
    </StaticPage>
  );
}

export default WebsitePage;
