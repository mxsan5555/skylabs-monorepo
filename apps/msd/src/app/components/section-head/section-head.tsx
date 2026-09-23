import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import content from '../../../content.json';
import './section-head.css';

export interface SectionHeadProps {
  /** Id of the h2; the parent <section aria-labelledby> points at it. */
  id: string;
  heading: string;
  /** Type role class for the h2. */
  titleClassName?: string;
  subheading?: string;
  seeAll?: string;
  seeAllTo?: string;
  /** Trailing controls after the See all link (e.g. carousel prev/next). */
  actions?: ReactNode;
}

const seeAllLabel = (seeAll: string, heading: string) =>
  content.cardRail.seeAllLabel.replace('{seeAll}', seeAll).replace('{heading}', heading);

/** Section header row: h2 (+ optional subheading) with an optional See all link and actions. */
export function SectionHead({ id, heading, titleClassName = 'headline-small', subheading, seeAll, seeAllTo, actions }: SectionHeadProps) {
  const link = seeAll && seeAllTo;
  return (
    <div className="section-head">
      <div className="section-head__text">
        <h2 id={id} className={`section-head__title ${titleClassName}`}>{heading}</h2>
        {subheading && <p className="section-head__sub body-large">{subheading}</p>}
      </div>
      {(link || actions) && (
        <div className="section-head__actions">
          {link && (
            <Link className="section-head__link label-large" to={seeAllTo} aria-label={seeAllLabel(seeAll, heading)}>
              {seeAll}
              <Icon aria-hidden="true">arrow_forward</Icon>
            </Link>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
