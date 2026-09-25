import { useRef } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDismiss } from './use-dismiss';

function setup(active: boolean) {
  const onDismiss = vi.fn();
  const container = document.createElement('div');
  const inside = document.createElement('button');
  container.appendChild(inside);
  document.body.appendChild(container);

  const { unmount } = renderHook(() => {
    const ref = useRef<HTMLElement | null>(container);
    useDismiss(active, ref, onDismiss);
  });

  return { onDismiss, container, inside, unmount };
}

describe('useDismiss', () => {
  it('calls onDismiss("escape") when Escape is pressed', () => {
    const { onDismiss } = setup(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).toHaveBeenCalledWith('escape');
  });

  it('does not call onDismiss on a pointerdown inside the ref', () => {
    const { onDismiss, inside } = setup(true);
    inside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('calls onDismiss("outside") on a pointerdown outside the ref', () => {
    const { onDismiss } = setup(true);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledWith('outside');
  });

  it('does nothing when inactive', () => {
    const { onDismiss } = setup(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
