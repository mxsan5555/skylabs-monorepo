import type { CatalogFaq } from '../../../api/catalog';
import content from '../../../content.json';

const t = content.home.faq;

/** CMS-managed FAQ. Answers are slotted light DOM so crawlers read them; hidden when empty. */
export function HomeFaq({ faqs }: { faqs: CatalogFaq[] }) {
  if (faqs.length === 0) return null;
  return (
    <section className="home-band home-band--tint" aria-labelledby="faq-heading">
      <div className="home-container home-faq">
        <div className="home-faq__intro">
          <h2 id="faq-heading" className="headline-small">{t.heading}</h2>
          <p className="home-head__sub body-large">{t.subheading}</p>
        </div>
        <sky-accordion single>
          {faqs.map((item) => (
            <sky-accordion-item key={item.id} header={item.question}>
              {item.answer}
            </sky-accordion-item>
          ))}
        </sky-accordion>
      </div>
    </section>
  );
}
