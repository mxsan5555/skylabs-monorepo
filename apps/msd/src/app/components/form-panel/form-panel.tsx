import type { ReactNode } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import './form-panel.css';

export interface FormPanelProps {
  /** Id of the h2, which names the region. */
  id: string;
  heading: string;
  intro?: string;
  /** `FormPanelSection`s, split by hairlines. */
  children: ReactNode;
  /** Buttons in the footer, the main action last (end aligned). */
  actions?: ReactNode;
  /** Content above the buttons in the footer (amount line, error alert). */
  footerLead?: ReactNode;
  /** Small print under the buttons. */
  note?: string;
}

/**
 * One step of a form (checkout) on the page surface (the 60): the step heading, then sections and
 * the footer with the actions, each split by a divider. No card; the tinted `SummaryPanel` beside
 * it is the only container.
 */
export function FormPanel({ id, heading, intro, children, actions, footerLead, note }: FormPanelProps) {
  return (
    <section className="form-panel" aria-labelledby={id}>
      <header className="form-panel__head">
        <h2 id={id} className="form-panel__heading title-large">
          {heading}
        </h2>
        {intro && <p className="form-panel__intro body-medium">{intro}</p>}
      </header>
      {children}
      {(actions || footerLead || note) && (
        <div className="form-panel__footer">
          {footerLead}
          {actions && <div className="form-panel__actions">{actions}</div>}
          {note && <p className="form-panel__note body-small">{note}</p>}
        </div>
      )}
    </section>
  );
}

export interface FormPanelSectionProps {
  /** Section heading (h3); leave out for a section that names itself (a fieldset legend). */
  title?: string;
  /** Decorative Material Symbol before the title. */
  icon?: string;
  /** Control at the end of the head row (Edit details). */
  action?: ReactNode;
  children: ReactNode;
}

/** One block of a `FormPanel`. */
export function FormPanelSection({ title, icon, action, children }: FormPanelSectionProps) {
  return (
    <div className="form-panel__section">
      {(title || action) && (
        <div className="form-panel__section-head">
          {icon && (
            <span className="form-panel__section-icon">
              <Icon aria-hidden="true">{icon}</Icon>
            </span>
          )}
          {title && <h3 className="form-panel__section-title title-small">{title}</h3>}
          {action && <span className="form-panel__section-action">{action}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
