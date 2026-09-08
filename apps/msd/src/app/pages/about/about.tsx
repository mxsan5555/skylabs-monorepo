import { useEffect, useState } from 'react';
import { getCatalogAboutUs, type CatalogAboutUs } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { resolveMediaUrl } from '../../../api/media';
import { renderBlock } from '../blog-detail/blog-detail';
import './about.css';

/** Public About Us page — `GET /catalog/about-us` on mount. Renders the singleton
 *  `AboutUsContent` row's hero/mission/body exactly as saved from the CMS admin page
 *  (`pages/account/cms/about-us.tsx`), reusing `blog-detail.tsx`'s `renderBlock` for the
 *  `body: BlogBlock[]` field (same block-rendering approach as a blog article's body). */
export function About() {
  const [aboutUs, setAboutUs] = useState<CatalogAboutUs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getCatalogAboutUs()
      .then(({ data }) => {
        if (!cancelled) setAboutUs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'Could not load this page.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="about">
        <title>About Us · MSD</title>
        <p className="loading-state">Loading…</p>
      </main>
    );
  }

  if (error || !aboutUs) {
    return (
      <main className="about">
        <title>About Us · MSD</title>
        <p className="error-state" role="alert">{error || 'This page is not available right now.'}</p>
      </main>
    );
  }

  const heroImage = aboutUs.mediaImages.find((img) => img.isPrimary) ?? aboutUs.mediaImages[0];
  const heading = aboutUs.heroTitle || 'About Us';

  return (
    <main className="about">
      <title>{aboutUs.metaTitle || `${heading} · MSD`}</title>
      <meta name="description" content={aboutUs.metaDescription || aboutUs.heroSubtitle || aboutUs.missionStatement || 'Learn more about MySpaDeal.'} />
      <article>
        <header className="about__hero">
          {heroImage && (
            <img
              className="about__hero-image"
              src={resolveMediaUrl(heroImage.storageKey)}
              alt={heading}
              width={1200}
              height={480}
            />
          )}
          <h1>{heading}</h1>
          {aboutUs.heroSubtitle && <p className="about__subtitle">{aboutUs.heroSubtitle}</p>}
        </header>

        {aboutUs.missionStatement && (
          <section className="about__mission" aria-label="Our mission">
            <h2>Our mission</h2>
            <p>{aboutUs.missionStatement}</p>
          </section>
        )}

        {aboutUs.body.length > 0 && <div className="post__body about__body">{aboutUs.body.map(renderBlock)}</div>}
      </article>
    </main>
  );
}

export default About;
