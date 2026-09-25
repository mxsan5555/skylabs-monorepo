import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { SidebarLayout } from './sidebar-layout';

function stubMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('SidebarLayout', () => {
  it('renders a plain aside column on desktop when open, and hides it when closed', () => {
    stubMedia(true);
    const { rerender } = render(
      <SidebarLayout open sidebar={<p>Sidebar content</p>} sidebarLabel="Filters" closeLabel="Close filters" onClose={vi.fn()}>
        <p>Main content</p>
      </SidebarLayout>,
    );
    const aside = screen.getByRole('complementary', { name: 'Filters' });
    expect(aside.getAttribute('role')).not.toBe('dialog');
    expect(screen.getByText('Main content')).toBeTruthy();

    rerender(
      <SidebarLayout open={false} sidebar={<p>Sidebar content</p>} sidebarLabel="Filters" closeLabel="Close filters" onClose={vi.fn()}>
        <p>Main content</p>
      </SidebarLayout>,
    );
    expect(screen.queryByText('Sidebar content')).toBeNull();
  });

  it('renders a modal side sheet on phones with a close button, Escape and scrim dismissal', () => {
    stubMedia(false);
    const onClose = vi.fn();
    render(
      <SidebarLayout open sidebar={<p>Sidebar content</p>} sidebarLabel="Filters" closeLabel="Close filters" onClose={onClose}>
        <p>Main content</p>
      </SidebarLayout>,
    );
    const aside = screen.getByRole('dialog', { name: 'Filters' });
    expect(aside.getAttribute('aria-modal')).toBe('true');

    const closeButton = document.querySelector('[aria-label="Close filters"]') as HTMLElement;
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    const scrim = document.querySelector('.sidebar-layout__scrim') as HTMLElement;
    expect(scrim).toBeTruthy();
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('traps focus on phones: the rest of the page is inert while the sheet is open, restored after', () => {
    stubMedia(false);
    const { container, rerender } = render(
      <SidebarLayout open sidebar={<p>Sidebar content</p>} sidebarLabel="Filters" closeLabel="Close filters" onClose={vi.fn()}>
        <p>Main content</p>
      </SidebarLayout>,
    );
    const aside = screen.getByRole('dialog', { name: 'Filters' });
    expect(container.contains(aside)).toBe(false); // portalled to <body>
    expect(container.inert).toBe(true);
    expect(document.activeElement).toBe(aside);

    rerender(
      <SidebarLayout open={false} sidebar={<p>Sidebar content</p>} sidebarLabel="Filters" closeLabel="Close filters" onClose={vi.fn()}>
        <p>Main content</p>
      </SidebarLayout>,
    );
    expect(container.inert).toBe(false);
  });
});
