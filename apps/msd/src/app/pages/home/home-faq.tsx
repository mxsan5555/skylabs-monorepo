import type { CatalogFaq } from '../../../api/catalog';
import { SectionHead } from '../../components/section-head/section-head';
import content from '../../../content.json';

const t = content.home.faq;

/** CMS-managed FAQ. Answers are slotted light DOM so crawlers read them; hidden when empty. */
export function HomeFaq({ faqs }: { faqs: CatalogFaq[] }) {
  if (faqs.length === 0) return null;
  return (
    <section className="home-band home-band--tint" aria-labelledby="faq-heading">
      <div className="home-container home-faq">
        <SectionHead id="faq-heading" heading={t.heading} subheading={t.subheading} />
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
