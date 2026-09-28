import { serializeJsonLd, type JsonLdObject } from './jsonld';

/** Inline structured data. Content is serialized by `serializeJsonLd`, which escapes `<`. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
