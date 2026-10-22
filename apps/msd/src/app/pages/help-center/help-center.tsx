import {
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { FilledButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import {
  listCatalogFaqs,
  type CatalogFaq,
} from '../../../api/catalog';
import content from '../../../content.json';
import './help-center.css';

const helpContent = content.helpCenter;

type FeatureCardColor =
  | 'surface-high'
  | 'secondary'
  | 'tertiary'
  | 'surface'
  | 'primary'
  | 'none'
  | 'inverse';

type IconStyle = 'surface' | 'filled' | 'tonal' | 'plain';

function isFeatureCardColor(
  value: string,
): value is FeatureCardColor {
  return [
    'surface-high',
    'secondary',
    'tertiary',
    'surface',
    'primary',
    'none',
    'inverse',
  ].includes(value);
}

function isIconStyle(value: string): value is IconStyle {
  return ['surface', 'filled', 'tonal', 'plain'].includes(value);
}

export function HelpCenter() {
  const [faqs, setFaqs] = useState<CatalogFaq[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedFaqId, setSelectedFaqId] = useState<string | null>(
    null,
  );

  const searchFieldRef = useRef<HTMLElement | null>(null);

  const supportColor: FeatureCardColor = isFeatureCardColor(
    helpContent.support.color,
  )
    ? helpContent.support.color
    : 'primary';

  const supportIconStyle: IconStyle = isIconStyle(
    helpContent.support.iconStyle,
  )
    ? helpContent.support.iconStyle
    : 'surface';

  const loadFaqs = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const { data } = await listCatalogFaqs();
      setFaqs(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFaqs();
  }, [loadFaqs]);

  useEffect(() => {
    const field = searchFieldRef.current;

    if (!field) {
      return;
    }

    const handleSubmit = (event: Event) => {
      const customEvent = event as CustomEvent<{ value: string }>;
      setSearch(customEvent.detail.value);
    };

    field.addEventListener('sky-submit', handleSubmit);

    return () => {
      field.removeEventListener('sky-submit', handleSubmit);
    };
  }, []);

  const filteredFaqs = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return faqs;
    }

    return faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query),
    );
  }, [faqs, search]);

  const handleFaqClick = (faqId: string) => {
    if (search.trim()) {
      setSelectedFaqId(faqId);
      setSearch('');

      if (searchFieldRef.current) {
        (
          searchFieldRef.current as HTMLElement & { value: string }
        ).value = '';
      }

      return;
    }

    setSelectedFaqId((currentId) =>
      currentId === faqId ? null : faqId,
    );
  };

  return (
    <main className="help-center">
      <title>{helpContent.metaTitle}</title>

      <meta
        name="description"
        content={helpContent.metaDescription}
      />

      <section className="help-center__hero">
        <div className="help-center__container">
          <h1>{helpContent.hero.heading}</h1>

          <p>{helpContent.hero.description}</p>

          <div className="help-center__search">
            <sky-action-field
              ref={searchFieldRef}
              role="search"
              type="search"
              enterkeyhint="search"
              icon={helpContent.hero.searchIcon}
              label={helpContent.hero.searchLabel}
              placeholder={helpContent.hero.searchPlaceholder}
              actionLabel={helpContent.hero.searchActionLabel}
              variant="outlined"
            />
          </div>
        </div>
      </section>

      <section className="help-center__content">
        <div className="help-center__container">
          <div className="help-center__section-heading">
            <h2>{helpContent.faqs.heading}</h2>
            <p>{helpContent.faqs.description}</p>
          </div>

          {loading && (
            <div className="help-center__state" role="status">
              <p>{helpContent.faqs.loading}</p>
            </div>
          )}

          {!loading && error && (
            <div className="help-center__state" role="alert">
              <Icon aria-hidden="true">
                {helpContent.faqs.error.icon}
              </Icon>

              <p>{helpContent.faqs.error.description}</p>

              <FilledButton onClick={() => void loadFaqs()}>
                {helpContent.faqs.error.retryButton}
              </FilledButton>
            </div>
          )}

          {!loading && !error && filteredFaqs.length === 0 && (
            <div className="help-center__state">
              <Icon aria-hidden="true">
                {helpContent.faqs.empty.icon}
              </Icon>

              <h3>
                {faqs.length === 0
                  ? helpContent.faqs.empty.noFaqsHeading
                  : helpContent.faqs.empty.noResultsHeading}
              </h3>

              <p>
                {faqs.length === 0
                  ? helpContent.faqs.empty.noFaqsDescription
                  : helpContent.faqs.empty.noResultsDescription}
              </p>
            </div>
          )}

          {!loading && !error && filteredFaqs.length > 0 && (
            <div className="help-center__faq-list">
              <sky-accordion>
                {filteredFaqs.map((faq) => (
                  <sky-accordion-item
                    key={faq.id}
                    header={faq.question}
                    open={selectedFaqId === faq.id}
                    onClick={() => handleFaqClick(faq.id)}
                  >
                    {faq.answer}
                  </sky-accordion-item>
                ))}
              </sky-accordion>
            </div>
          )}
        </div>

        <div className="help-center__support">
          <sky-cta-banner
            color={supportColor}
            icon={helpContent.support.icon}
            iconStyle={supportIconStyle}
            headline={helpContent.support.heading}
            text={helpContent.support.description}
            ctaLabel={helpContent.support.button}
            ctaHref={helpContent.support.href}
            ctaIcon={helpContent.support.buttonIcon}
          />
        </div>
      </section>
    </main>
  );
}

export default HelpCenter;