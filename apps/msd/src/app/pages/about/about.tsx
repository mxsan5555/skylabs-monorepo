import { useEffect, useState } from 'react';
import { getCatalogAboutUs, type CatalogAboutUs } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { resolveMediaUrl } from '../../../api/media';
import { renderBlock } from '../blog-detail/blog-detail';
import { Breadcrumb } from '../../components/breadcrumb';
import './about.css';

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
        if (!cancelled) {
          setAboutUs(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiRequestError
              ? err.message
              : 'Could not load this page.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="about">
        <title>About Us · MSD</title>

        <div className="about__container">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: 'About Us' },
            ]}
          />

          <div className="about__state">
            <sky-info-card
              icon="hourglass_empty"
              heading="Loading About Us"
              subheading="Please wait while we load the latest information."
            />
          </div>
        </div>
      </main>
    );
  }

  if (error || !aboutUs) {
    return (
      <main className="about">
        <title>About Us · MSD</title>

        <div className="about__container">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: 'About Us' },
            ]}
          />

          <div className="about__state">
            <sky-info-card
              icon="error_outline"
              heading="About Us is unavailable"
              subheading={
                error || 'This page is not available right now.'
              }
            />
          </div>
        </div>
      </main>
    );
  }

  const heroImage =
    aboutUs.mediaImages.find((img) => img.isPrimary) ??
    aboutUs.mediaImages[0];

  const heading = aboutUs.heroTitle || 'About Us';

  return (
    <main className="about">
      <title>{aboutUs.metaTitle || `${heading} · MSD`}</title>

      <meta
        name="description"
        content={
          aboutUs.metaDescription ||
          aboutUs.heroSubtitle ||
          aboutUs.missionStatement ||
          'Learn more about MySpaDeal.'
        }
      />

      <div className="about__container">
        <Breadcrumb
          items={[
            { label: 'Home', to: '/' },
            { label: 'About Us' },
          ]}
        />

        {/* Hero */}
        <section className="about__hero" aria-labelledby="about-title">
          <div className="about__hero-content">
            <p className="about__eyebrow">ABOUT MYSPADEAL</p>

            <h1 id="about-title">{heading}</h1>

            {aboutUs.heroSubtitle && (
              <p className="about__subtitle">
                {aboutUs.heroSubtitle}
              </p>
            )}
          </div>

          {heroImage && (
            <sky-card className="about__hero-card">
              <img
                className="about__hero-image"
                src={resolveMediaUrl(heroImage.storageKey)}
                alt={heading}
                width={1200}
                height={480}
              />
            </sky-card>
          )}
        </section>

        {/* Mission */}
        {aboutUs.missionStatement && (
          <section
            className="about__mission"
            aria-labelledby="about-mission-title"
          >
            <sky-tile-card
              className="about__mission-card"
              icon="spa"
              headline="Our Mission"
              text={aboutUs.missionStatement}
            />
          </section>
        )}

        {/* CMS Body */}
        {aboutUs.body.length > 0 && (
          <section
            className="about__content"
            aria-label="About MySpaDeal"
          >
            <sky-card className="about__content-card">
              <div className="post__body about__body">
                {aboutUs.body.map(renderBlock)}
              </div>
            </sky-card>
          </section>
        )}
      </div>
    </main>
  );
}

export default About;