import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-feature-card.js';
import { SkyCtaBanner, SkyFeatureCard } from './sky-feature-card.js';

installMaterialJsdomPolyfills();

async function create<T extends SkyFeatureCard>(tag: string, props: Partial<T> = {}): Promise<T> {
  const el = document.createElement(tag) as T;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-feature-card', () => {
  it('reflects M3 defaults (surface / filled / extra-large / vertical)', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card');
    expect(el.getAttribute('color')).toBe('surface');
    expect(el.getAttribute('variant')).toBe('filled');
    expect(el.getAttribute('shape')).toBe('extra-large');
    expect(el.getAttribute('layout')).toBe('vertical');
  });

  it('renders icon, headline and text', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', {
      icon: 'card_giftcard',
      headline: 'Give the gift of wellness',
      text: 'Redeemable at partner spas.',
    });
    expect(el.shadowRoot?.querySelector('.icon md-icon')?.textContent).toBe('card_giftcard');
    expect(el.shadowRoot?.querySelector('h3')?.textContent).toBe('Give the gift of wellness');
    expect(el.shadowRoot?.querySelector('p')?.textContent).toBe('Redeemable at partner spas.');
  });

  it('renders the CTA as a linked md-filled-button', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', { ctaLabel: 'Buy gift card', ctaHref: '/gift-cards' });
    const cta = el.shadowRoot?.querySelector('md-filled-button.cta');
    expect(cta?.textContent?.trim()).toBe('Buy gift card');
    expect(cta?.getAttribute('href')).toBe('/gift-cards');
  });

  it('hides the actions row when there is no CTA and nothing slotted', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', { headline: 'Info only' });
    expect(el.shadowRoot?.querySelector('.actions')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows the actions row when buttons are slotted', async () => {
    const el = document.createElement('sky-feature-card') as SkyFeatureCard;
    const button = document.createElement('button');
    button.slot = 'actions';
    el.appendChild(button);
    document.body.appendChild(el);
    await el.updateComplete;
    el.shadowRoot?.querySelector('slot[name="actions"]')?.dispatchEvent(new Event('slotchange'));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.actions')?.hasAttribute('hidden')).toBe(false);
  });
});

describe('sky-cta-banner', () => {
  it('is a feature card preset to horizontal layout and large shape', async () => {
    const el = await create<SkyCtaBanner>('sky-cta-banner', { ctaLabel: 'Go' });
    expect(el).toBeInstanceOf(SkyFeatureCard);
    expect(el.getAttribute('layout')).toBe('horizontal');
    expect(el.getAttribute('shape')).toBe('large');
  });
});
