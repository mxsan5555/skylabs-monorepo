import type { ReactNode } from 'react';
import { Icon } from '@skylabs-monorepo/shared-ui/react';
import './status-panel.css';

export type StatusTone = 'success' | 'error' | 'neutral';

export interface StatusFact {
  label: string;
  value: string;
}

export interface StatusPanelProps {
  /** Id of the heading, for `aria-labelledby` and focus after a navigation. */
  id: string;
  /** Material Symbols name; decorative, the heading says the outcome in words. */
  icon: string;
  /** Colour role of the icon badge: secondary (success), error, or neutral (waiting, cancelled). */
  tone: StatusTone;
  heading: string;
  /** Heading level; `h1` when the panel heads the page. */
  as?: 'h1' | 'h2';
  text: string;
  /** Key facts as a description list (order number, date). */
  facts?: StatusFact[];
  /** Next-step buttons. */
  actions?: ReactNode;
  /** Small print under the actions (help link). */
  footer?: ReactNode;
}

/**
 * Outcome panel for a finished task (order result): tinted surface-container (the 30), a tonal
 * icon badge, the heading, a short explanation, key facts and the next steps. Token-only CSS.
 */
export function StatusPanel({ id, icon, tone, heading, as: Heading = 'h1', text, facts, actions, footer }: StatusPanelProps) {
  return (
    <div className={`status-panel status-panel--${tone}`}>
      <span className="status-panel__icon">
        <Icon aria-hidden="true">{icon}</Icon>
      </span>
      <div className="status-panel__intro">
        <Heading id={id} className="status-panel__heading headline-medium">
          {heading}
        </Heading>
        <p className="status-panel__text body-large">{text}</p>
      </div>
      {facts && facts.length > 0 && (
        <dl className="status-panel__facts">
          {facts.map((fact) => (
            <div key={fact.label} className="status-panel__fact">
              <dt className="label-medium">{fact.label}</dt>
              <dd className="title-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="status-panel__actions">{actions}</div>}
      {footer && <div className="status-panel__footer body-medium">{footer}</div>}
    </div>
  );
}
