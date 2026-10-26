import { JsonLd } from './json-ld';
import type { JsonLdObject } from './jsonld';
import { absoluteUrl } from './site-url';
import content from '../../content.json';
import { OG_IMAGE_SRC } from '../../brand';

export interface SeoProps {
  title: string;
  description: string;
  /** Route path for canonical / og:url, e.g. "/category/massage". */
  path: string;
  /** Absolute image URL for social cards. */
  image?: string;
  /** `true` = noindex, nofollow; `'follow'` = noindex, follow (search results whose links should
   *  still be crawled). */
  noindex?: boolean | 'follow';
  jsonLd?: JsonLdObject | JsonLdObject[];
}

/** Per-page head tags. React 19 hoists <title>, <meta> and <link> into <head>. */
export function Seo({ title, description, path, image, noindex, jsonLd }: SeoProps) {
  const url = absoluteUrl(path);
  // Pages without their own image share the brand card, so links never preview blank.
  const shareImage = image ?? absoluteUrl(OG_IMAGE_SRC);
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {url && <link rel="canonical" href={url} />}
      {noindex && <meta name="robots" content={noindex === 'follow' ? 'noindex, follow' : 'noindex, nofollow'} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={content.site.fullName} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {url && <meta property="og:url" content={url} />}
      {shareImage && <meta property="og:image" content={shareImage} />}
      {shareImage && <meta name="twitter:image" content={shareImage} />}
      <meta name="twitter:card" content={shareImage ? 'summary_large_image' : 'summary'} />
      {jsonLd && <JsonLd data={jsonLd} />}
    </>
  );
}
