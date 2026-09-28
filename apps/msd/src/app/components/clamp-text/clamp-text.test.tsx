import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ClampText } from './clamp-text';

const toggle = () => document.querySelector('md-text-button') as HTMLElement | null;

describe('ClampText', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows no toggle when the text fits', () => {
    render(<ClampText text="Short" more="More" less="Less" />);
    expect(screen.getByText('Short').tagName).toBe('P');
    expect(toggle()).toBeNull();
  });

  it('shows More when the text overflows and toggles aria-expanded', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(48);
    render(<ClampText text="Long text" more="More" less="Less" />);
    const btn = toggle() as HTMLElement;
    expect(btn.textContent).toBe('More');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(toggle()?.textContent).toBe('Less');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
  });
});
