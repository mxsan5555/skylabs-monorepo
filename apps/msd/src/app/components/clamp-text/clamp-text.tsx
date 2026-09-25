import { useEffect, useId, useRef, useState } from 'react';
import { TextButton } from '@skylabs-monorepo/shared-ui/react';
import './clamp-text.css';

/** Body text clamped to two lines with a More / Less toggle, shown only when it overflows. */
export function ClampText({ text, more, less }: { text: string; more: string; less: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Measure only while clamped; expanded text never overflows.
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="clamp-text">
      <p ref={ref} id={id} className={`clamp-text__body body-large${expanded ? '' : ' clamp-text__body--clamped'}`}>
        {text}
      </p>
      {(overflows || expanded) && (
        <TextButton aria-expanded={expanded ? 'true' : 'false'} aria-controls={id} onClick={() => setExpanded((e) => !e)}>
          {expanded ? less : more}
        </TextButton>
      )}
    </div>
  );
}
