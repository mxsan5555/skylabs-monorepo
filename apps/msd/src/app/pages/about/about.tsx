import { useEffect, useState } from 'react';
import { ChipSet, Icon, AssistChip } from '@skylabs-monorepo/shared-ui/react';
import { getCatalogAboutUs, type CatalogAboutUs, } from '../../../api/catalog';
import { ApiRequestError } from '../../../api/rbac/client';
import { resolveMediaUrl } from '../../../api/media';
import { renderBlock } from '../blog-detail/blog-detail';
import { Breadcrumb } from '../../components/breadcrumb';
import './about.css';
import content from '../../../content.json';
type AboutTileColor =| 'surface-high'| 'secondary'| 'tertiary'| 'none'| 'surface'| 'primary'| 'inverse';
export function About() {
  const [aboutUs, setAboutUs] = useState<CatalogAboutUs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const aboutContent = content.about;
  useEffect(() => {
    let cancelled = false;
    async function loadAboutUs() {
      setLoading(true);
      setError('');
      try {
        const { data } = await getCatalogAboutUs();
        if (!cancelled) { setAboutUs(data); }
      } catch (err) {
        if (!cancelled) {setError(err instanceof ApiRequestError ? err.message : 'Could not load this page.',);}
      } 
      finally {if (!cancelled) {setLoading(false);}}
    }
    void loadAboutUs(); return () => { cancelled = true; };
  }, []);
  const breadcrumbs = [
    { label: aboutContent.breadcrumb.home, to: '/' },
    { label: aboutContent.breadcrumb.aboutUs },
  ];
  if (loading) {
    return (
      <main className="about">
        <title>{aboutContent.loading.title}</title>
        <div className="about__container">
          <Breadcrumb items={breadcrumbs} />
          <div className="about__state">
            <sky-info-card
              align="center"
              icon="hourglass_empty"
              heading={aboutContent.loading.heading}
              subheading={aboutContent.loading.description}
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
          <Breadcrumb items={breadcrumbs} />
          <div className="about__state">
            <sky-info-card
              align="center"
              icon="error_outline"
              heading={aboutContent.error.heading}
              subheading={error || aboutContent.error.description}
            />
          </div>
        </div>
      </main>
    );
  }
  const heroImage = aboutUs.mediaImages.find((image) => image.isPrimary) ?? aboutUs.mediaImages[0];
  const heading = aboutUs.heroTitle || 'About MySpaDeal';
  return (
    <main className="about">
      <title>{aboutUs.metaTitle || `${heading} · MSD`}</title>
      <meta
        name="description"
        content={aboutUs.metaDescription || aboutUs.heroSubtitle || aboutUs.missionStatement || 'Learn more about MySpaDeal.'}
      />
      <div className="about__container">
        <Breadcrumb items={breadcrumbs} />
        <section className="about__hero" aria-labelledby="about-title">
          <div className="about__hero-copy">
            <p className="about__eyebrow">{aboutContent.eyebrow}</p>
            <h1 id="about-title">{heading}</h1>
            {aboutUs.heroSubtitle && (<p className="about__subtitle">{aboutUs.heroSubtitle}</p>)}
            <div className="about__chips">
              <ChipSet>
                {aboutContent.chips.map((label) => (<AssistChip key={label} label={label} />
                ))}
              </ChipSet>
            </div>
          </div>
          {heroImage && (
            <div className="about__hero-visual">
              <div className="about__hero-image-wrap">
                <sky-image
                  className="about__hero-image"
                  src={resolveMediaUrl(heroImage.storageKey)}
                  alt={heading}
                  ratio="4 / 3"
                  fit="cover"
                />
              </div>
              <div className="about__hero-spotlight">
                <div className="about__spotlight-content">
                  <span className="about__spotlight-icon" aria-hidden="true"><Icon>spa</Icon></span>
                  <div className="about__spotlight-text">
                    <p className="about__spotlight-label"> {aboutContent.spotlight.label}</p>
                    <h3>{aboutContent.spotlight.heading}</h3>
                    <p>{aboutContent.spotlight.description}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
        {aboutUs.missionStatement && (
          <section className="about__mission" aria-labelledby="mission-title">
            <div className="about__mission-intro">
              <p className="about__eyebrow">{aboutContent.mission.eyebrow}</p>
              <h2 id="mission-title">{aboutContent.mission.heading}</h2>
            </div>
            <div className="about__mission-content">
              <sky-feature-card
                color="primary"
                icon="spa"
                iconStyle="surface"
                headline={aboutContent.mission.cardHeading}
                text={aboutUs.missionStatement}
              />
            </div>
          </section>
        )}
        <section className="about__values" aria-labelledby="values-title">
          <div className="about__section-heading">
            <p className="about__eyebrow">  {aboutContent.values.eyebrow}</p>
            <h2 id="values-title">{aboutContent.values.heading}</h2>
            <p>{aboutContent.values.description}</p>
          </div>
          <div className="about__values-grid">
            {aboutContent.values.cards.map((card) => (
              <sky-tile-card
                key={card.heading}
                icon={card.icon}
                headline={card.heading}
                text={card.description}
                color={card.color as AboutTileColor}
                variant="filled"
                iconStyle="surface"
              />
            ))}
          </div>
        </section>
        {aboutUs.body.length > 0 && (
          <section className="about__story" aria-labelledby="story-title">
            <div className="about__story-heading">
              <p className="about__eyebrow"> {aboutContent.story.eyebrow}</p>
              <h2 id="story-title">{aboutContent.story.heading}</h2>
            </div>
            <sky-card className="about__content-card">
              <div className="about__body">{aboutUs.body.map(renderBlock)}</div>
            </sky-card>
          </section>
        )}
        <section className="about__cta" aria-label={aboutContent.cta.ariaLabel}>
          <sky-cta-banner
            color="primary"
            icon={aboutContent.cta.icon}
            iconStyle="surface"
            headline={aboutContent.cta.heading}
            text={aboutContent.cta.description}
            ctaLabel={aboutContent.cta.button}
            ctaHref={aboutContent.cta.href}
            ctaIcon={aboutContent.cta.buttonIcon}
          />
        </section>
      </div>
    </main>
  );
}
export default About;