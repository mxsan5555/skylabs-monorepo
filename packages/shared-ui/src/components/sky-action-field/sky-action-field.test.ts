import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-action-field.js';
import { SkyActionField } from './sky-action-field.js';

installMaterialJsdomPolyfills();

async function create(props: Partial<SkyActionField> = {}): Promise<SkyActionField> {
  const el = document.createElement('sky-action-field') as SkyActionField;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const input = (el: SkyActionField) => el.shadowRoot?.querySelector('input') as HTMLInputElement;
const form = (el: SkyActionField) => el.shadowRoot?.querySelector('form') as HTMLFormElement;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-action-field', () => {
  it('reflects M3 defaults (filled, full shape, not dense)', async () => {
    const el = await create();
    expect(el.getAttribute('variant')).toBe('filled');
    expect(el.getAttribute('shape')).toBe('full');
    expect(el.hasAttribute('dense')).toBe(false);
  });

  it('labels the input and forwards native input attributes', async () => {
    const el = await create({
      label: 'Email address',
      placeholder: 'you@example.com',
      type: 'email',
      name: 'email',
      autocomplete: 'email',
      enterkeyhint: 'send',
      required: true,
    });
    const field = input(el);
    expect(field.getAttribute('aria-label')).toBe('Email address');
    expect(field.placeholder).toBe('you@example.com');
    expect(field.type).toBe('email');
    expect(field.name).toBe('email');
    expect(field.getAttribute('autocomplete')).toBe('email');
    expect(field.getAttribute('enterkeyhint')).toBe('send');
    expect(field.required).toBe(true);
  });

  it('renders a decorative leading icon only when icon is set', async () => {
    const el = await create();
    expect(el.shadowRoot?.querySelector('.lead')).toBeNull();
    el.icon = 'search';
    await el.updateComplete;
    const icon = el.shadowRoot?.querySelector('md-icon.lead');
    expect(icon?.textContent).toBe('search');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders a labelled md-filled-button for action-label', async () => {
    const el = await create({ actionLabel: 'Subscribe', actionIcon: 'send' });
    const button = el.shadowRoot?.querySelector('md-filled-button.action');
    expect(button?.textContent).toContain('Subscribe');
    expect(button?.hasAttribute('trailing-icon')).toBe(true);
  });

  it('renders an icon-only button named by label when only action-icon is set', async () => {
    const el = await create({ label: 'Search deals', actionIcon: 'arrow_forward' });
    expect(el.shadowRoot?.querySelector('md-filled-button')).toBeNull();
    const button = el.shadowRoot?.querySelector('md-filled-icon-button.action');
    expect(button?.getAttribute('aria-label')).toBe('Search deals');
  });

  it('keeps value in sync with typing', async () => {
    const el = await create();
    const field = input(el);
    field.value = 'hot stone';
    field.dispatchEvent(new Event('input'));
    expect(el.value).toBe('hot stone');
  });

  it('fires a composed sky-submit with the trimmed value on submit', async () => {
    const el = await create({ value: '  facial  ' });
    const onSubmit = vi.fn();
    document.addEventListener('sky-submit', onSubmit);
    form(el).dispatchEvent(new Event('submit', { cancelable: true }));
    document.removeEventListener('sky-submit', onSubmit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect((onSubmit.mock.calls[0][0] as CustomEvent).detail).toEqual({ value: 'facial' });
  });

  it('disables the input and the action', async () => {
    const el = await create({ actionLabel: 'Go', disabled: true });
    expect(input(el).disabled).toBe(true);
    expect(el.shadowRoot?.querySelector('md-filled-button')?.hasAttribute('disabled')).toBe(true);
  });
});
