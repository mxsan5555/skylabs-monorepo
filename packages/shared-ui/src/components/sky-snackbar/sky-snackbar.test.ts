import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-snackbar.js';
import { SkySnackbar, type SkySnackbarVariant } from './sky-snackbar.js';

installMaterialJsdomPolyfills();

async function create(props: Partial<SkySnackbar> = {}, text = 'Changes saved.'): Promise<SkySnackbar> {
  const el = document.createElement('sky-snackbar') as SkySnackbar;
  Object.assign(el, props);
  el.textContent = text;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('sky-snackbar', () => {
  it('defaults to the neutral variant, closed, with a 4000ms duration', async () => {
    const el = await create();
    expect(el.variant).toBe('neutral');
    expect(el.open).toBe(false);
    expect(el.duration).toBe(4000);
    expect(el.closable).toBe(false);
  });

  it('show() opens it and hide() closes it, reflecting the open attribute', async () => {
    const el = await create({ duration: 0 });
    el.show();
    await el.updateComplete;
    expect(el.open).toBe(true);
    expect(el.hasAttribute('open')).toBe(true);
    el.hide();
    await el.updateComplete;
    expect(el.open).toBe(false);
    expect(el.hasAttribute('open')).toBe(false);
  });

  it('show(message) replaces the slotted content', async () => {
    const el = await create({ duration: 0 });
    el.show('Item deleted.');
    await el.updateComplete;
    expect(el.textContent?.trim()).toBe('Item deleted.');
  });

  describe.each<{ variant: SkySnackbarVariant; role: string; live: string; icon: string }>([
    { variant: 'neutral', role: 'status', live: 'polite', icon: '' },
    { variant: 'success', role: 'status', live: 'polite', icon: 'check_circle' },
    { variant: 'warning', role: 'status', live: 'polite', icon: 'warning' },
    { variant: 'error', role: 'alert', live: 'assertive', icon: 'error' },
    { variant: 'info', role: 'status', live: 'polite', icon: 'info' },
  ])('variant=$variant', ({ variant, role, live, icon }) => {
    it(`sets role="${role}" and aria-live="${live}"`, async () => {
      const el = await create({ variant });
      expect(el.getAttribute('role')).toBe(role);
      expect(el.getAttribute('aria-live')).toBe(live);
      expect(el.getAttribute('aria-atomic')).toBe('true');
    });

    it(icon ? `renders the default "${icon}" icon` : 'renders no icon by default', async () => {
      const el = await create({ variant });
      const iconEl = el.shadowRoot?.querySelector('md-icon.icon');
      if (icon) {
        expect(iconEl?.textContent).toBe(icon);
        expect(iconEl?.getAttribute('aria-hidden')).toBe('true');
      } else {
        expect(iconEl).toBeNull();
      }
    });
  });

  it('an explicit icon="" suppresses even a variant default icon', async () => {
    const el = await create({ variant: 'error', icon: '' });
    expect(el.shadowRoot?.querySelector('md-icon.icon')).toBeNull();
  });

  it('an explicit icon overrides the variant default', async () => {
    const el = await create({ variant: 'success', icon: 'star' });
    expect(el.shadowRoot?.querySelector('md-icon.icon')?.textContent).toBe('star');
  });

  it('renders no action button without actionLabel, and one with it', async () => {
    const noAction = await create();
    expect(noAction.shadowRoot?.querySelector('md-text-button.action')).toBeNull();

    const withAction = await create({ actionLabel: 'Undo' });
    const btn = withAction.shadowRoot?.querySelector('md-text-button.action');
    expect(btn?.textContent?.trim()).toBe('Undo');
  });

  it('renders no close button unless closable is set', async () => {
    const noClose = await create();
    expect(noClose.shadowRoot?.querySelector('md-icon-button.close')).toBeNull();

    const withClose = await create({ closable: true });
    expect(withClose.shadowRoot?.querySelector('md-icon-button.close')).not.toBeNull();
  });

  it('auto-dismisses after `duration` ms, firing sky-closed with reason "timeout"', async () => {
    vi.useFakeTimers();
    const el = await create({ duration: 4000 });
    const onClosed = vi.fn();
    el.addEventListener('sky-closed', onClosed);
    el.show();
    await el.updateComplete;
    expect(el.open).toBe(true);

    vi.advanceTimersByTime(3999);
    expect(el.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.open).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect((onClosed.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'timeout' });
  });

  it('duration=0 disables auto-dismiss', async () => {
    vi.useFakeTimers();
    const el = await create({ duration: 0 });
    el.show();
    vi.advanceTimersByTime(60_000);
    expect(el.open).toBe(true);
  });

  it('pauses the auto-dismiss timer on hover and resumes it on mouseleave', async () => {
    vi.useFakeTimers();
    const el = await create({ duration: 4000 });
    el.show();
    const surface = el.shadowRoot?.querySelector('.surface') as HTMLElement;

    vi.advanceTimersByTime(3000);
    surface.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(10_000); // would have fired long ago if not paused
    expect(el.open).toBe(true);

    surface.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(999); // remaining ~1000ms from the 3000/4000 point
    expect(el.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.open).toBe(false);
  });

  it('pauses on focusin and resumes on focusout', async () => {
    vi.useFakeTimers();
    const el = await create({ duration: 4000, closable: true });
    el.show();
    const surface = el.shadowRoot?.querySelector('.surface') as HTMLElement;

    vi.advanceTimersByTime(3500);
    surface.dispatchEvent(new FocusEvent('focusin'));
    vi.advanceTimersByTime(10_000);
    expect(el.open).toBe(true);

    surface.dispatchEvent(new FocusEvent('focusout'));
    vi.advanceTimersByTime(499);
    expect(el.open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(el.open).toBe(false);
  });

  it('clicking the action button fires sky-action then closes with reason "action"', async () => {
    const el = await create({ actionLabel: 'Undo', duration: 0 });
    el.show();
    await el.updateComplete;
    const onAction = vi.fn();
    const onClosed = vi.fn();
    el.addEventListener('sky-action', onAction);
    el.addEventListener('sky-closed', onClosed);

    (el.shadowRoot?.querySelector('md-text-button.action') as HTMLElement).click();
    await el.updateComplete;

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect((onClosed.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'action' });
    expect(el.open).toBe(false);
  });

  it('clicking the close button closes with reason "close"', async () => {
    const el = await create({ closable: true, duration: 0 });
    el.show();
    await el.updateComplete;
    const onClosed = vi.fn();
    el.addEventListener('sky-closed', onClosed);

    (el.shadowRoot?.querySelector('md-icon-button.close') as HTMLElement).click();
    await el.updateComplete;

    expect((onClosed.mock.calls[0][0] as CustomEvent).detail).toEqual({ reason: 'close' });
    expect(el.open).toBe(false);
  });

  it('hide() on an already-closed snackbar is a no-op (no duplicate sky-closed)', async () => {
    const el = await create({ duration: 0 });
    const onClosed = vi.fn();
    el.addEventListener('sky-closed', onClosed);
    el.hide();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('re-calling show() while open restarts the timer', async () => {
    vi.useFakeTimers();
    const el = await create({ duration: 4000 });
    el.show();
    vi.advanceTimersByTime(3900);
    el.show(); // restart
    vi.advanceTimersByTime(3900);
    expect(el.open).toBe(true); // would have fired at the old deadline
    vi.advanceTimersByTime(100);
    expect(el.open).toBe(false);
  });

  it('clears the pending timer on disconnect (no late sky-closed after removal)', async () => {
    vi.useFakeTimers();
    const el = await create({ duration: 4000 });
    const onClosed = vi.fn();
    el.addEventListener('sky-closed', onClosed);
    el.show();
    el.remove();
    vi.advanceTimersByTime(10_000);
    expect(onClosed).not.toHaveBeenCalled();
  });
});
