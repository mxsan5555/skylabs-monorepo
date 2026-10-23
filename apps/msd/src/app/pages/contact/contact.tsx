import { getCatalogContactUs } from '../../../api/catalog';
import { useCmsContent } from '../../../hooks/use-cms-content';
import {
  ContactDetails,
  contactInfo,
} from '../../components/contact-details/contact-details';
import { PageSection } from '../../components/page-section/page-section';
import { SectionHead } from '../../components/section-head/section-head';
import { SplitLayout } from '../../components/split-layout/split-layout';
import { StaticPage } from '../../components/static-page/static-page';
import { webPageJsonLd } from '../../seo/jsonld';
import { absoluteUrl } from '../../seo/site-url';
import { ContactForm } from './contact-form';
import content from '../../../content.json';

const t = content.contact;

/** Contact us: address, phone and email (CMS `GET /catalog/contact-us` over content.json
 *  defaults) and the contact form on the left, the office map on the right. */
export function Contact() {
  const { data } = useCmsContent(getCatalogContactUs);
  const url = absoluteUrl(t.path);
  const { items, email, mapUrl } = contactInfo(data);

  return (
    <StaticPage
      path={t.path}
      title={t.title}
      breadcrumb={t.breadcrumb}
      description={t.description}
      metaTitle={data?.metaTitle}
      metaDescription={data?.metaDescription}
      schema={
        url
          ? webPageJsonLd({
              type: 'ContactPage',
              name: t.title,
              description: t.description,
              url,
            })
          : undefined
      }
      cta={t.cta}
    >
      <PageSection tone="tint" aria-labelledby="contact-details">
        <SplitLayout
          asideLabel={t.mapTitle}
          aside={
            mapUrl && (
              <iframe
                className="map-frame map-frame--tall"
                src={mapUrl}
                title={t.mapTitle}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            )
          }
        >
          <div>
            <SectionHead id="contact-details" heading={t.detailsHeading} />
            <ContactDetails items={items} />
          </div>
          <ContactForm to={email} />
        </SplitLayout>
      </PageSection>
    </StaticPage>
  );
}

export default Contact;
