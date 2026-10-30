import { Icon } from '@skylabs-monorepo/shared-ui/react';
import './step-indicator.css';

export interface StepIndicatorProps {
  /** Accessible name of the list (e.g. "Checkout steps"). */
  label: string;
  steps: string[];
  /** Index of the current step; earlier steps are done. */
  current: number;
  /** Read after a done step's name (e.g. "completed"). */
  doneLabel: string;
  /** Role of the current step: `primary` (default) or `error` (a cancellation). */
  tone?: 'primary' | 'error';
}

/** Read-only progress through a short flow (checkout): numbered markers, a check on done steps,
 *  `aria-current="step"` on the current one. */
export function StepIndicator({ label, steps, current, doneLabel, tone = 'primary' }: StepIndicatorProps) {
  return (
    <ol className={tone === 'error' ? 'step-indicator step-indicator--error' : 'step-indicator'} aria-label={label}>
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'next';
        return (
          <li key={step} className={`step-indicator__step step-indicator__step--${state}`} {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}>
            <span className="step-indicator__marker label-large" aria-hidden="true">
              {state === 'done' ? <Icon>check</Icon> : index + 1}
            </span>
            <span className="step-indicator__label title-small">
              {step}
              {state === 'done' && <span className="sr-only"> {doneLabel}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
