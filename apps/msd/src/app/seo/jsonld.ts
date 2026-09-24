/** schema.org JSON-LD builders. Values always come from real data or content.json. */
export type JsonLdObject = Record<string, unknown>;

const CONTEXT = 'https://schema.org';

export function organizationJsonLd(input: { name: string; url: string; logo?: string; sameAs: string[] }): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    name: input.name,
    url: input.url,
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.sameAs.length > 0 ? { sameAs: input.sameAs } : {}),
  };
}

export function websiteJsonLd(input: { name: string; url: string }): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${input.url}/explore?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbJsonLd(siteUrl: string, items: { name: string; path: string }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: new URL(item.path, `${siteUrl}/`).toString(),
    })),
  };
}

/** Carousel deals as a list of Products, each with a nested INR Offer. No ratings: real reviews
 *  don't exist yet. */
export function itemListJsonLd(
  siteUrl: string,
  items: { name: string; path: string; price: number; image?: string }[],
): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => {
      const url = new URL(item.path, `${siteUrl}/`).toString();
      return {
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: item.name,
          url,
          ...(item.image ? { image: item.image } : {}),
          offers: {
            '@type': 'Offer',
            price: item.price,
            priceCurrency: 'INR',
            url,
          },
        },
      };
    }),
  };
}

export function faqPageJsonLd(faqs: { question: string; answer: string }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/** JSON for an inline <script>: escapes `<` (and U+2028/U+2029) so data can never close the
 *  script element. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
