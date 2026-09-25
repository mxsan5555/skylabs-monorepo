import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { useCustomEvent } from './use-custom-event';

function Probe({ onSubmit }: { onSubmit: (e: CustomEvent<{ value: string }>) => void }) {
  const ref = useRef<HTMLElement>(null);
  useCustomEvent(ref, 'sky-submit', onSubmit);
  return <div ref={ref as React.RefObject<HTMLDivElement>} data-testid="host" />;
}

describe('useCustomEvent', () => {
  it('calls the latest handler and cleans up on unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByTestId, rerender, unmount } = render(<Probe onSubmit={first} />);
    const host = getByTestId('host');
    host.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'a' } }));
    rerender(<Probe onSubmit={second} />);
    host.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'b' } }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0][0].detail.value).toBe('b');
    unmount();
    host.dispatchEvent(new CustomEvent('sky-submit', { detail: { value: 'c' } }));
    expect(second).toHaveBeenCalledTimes(1);
  });
});
