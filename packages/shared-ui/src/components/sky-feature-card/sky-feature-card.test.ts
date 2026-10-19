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

describe('sky-feature-card image and cta-color (CTA banners)', () => {
  it('renders no media block by default', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', { headline: 'Plain' });
    expect(el.shadowRoot?.querySelector('.media')).toBeNull();
    expect(el.hasAttribute('cta-color')).toBe(false);
  });

  it('renders the image with its alt text, lazily', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', { image: '/banner.jpg', imageAlt: 'Spa room' });
    const img = el.shadowRoot?.querySelector('.media img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/banner.jpg');
    expect(img.getAttribute('alt')).toBe('Spa room');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('treats an image without alt text as decorative', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', { image: '/banner.jpg' });
    expect(el.shadowRoot?.querySelector('.media img')?.getAttribute('alt')).toBe('');
  });

  it('reflects cta-color so the button can use its own M3 role', async () => {
    const el = await create<SkyCtaBanner>('sky-cta-banner', { color: 'surface', ctaColor: 'tertiary', ctaLabel: 'Book' });
    expect(el.getAttribute('cta-color')).toBe('tertiary');
  });
});

describe('sky-feature-card broken image', () => {
  it('swaps a broken image for a neutral placeholder, and retries a new one', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', { image: '/missing.jpg' });
    const query = (selector: string) => el.shadowRoot?.querySelector(selector) ?? null;
    query('.media img')?.dispatchEvent(new Event('error'));
    await el.updateComplete;
    expect(query('.media img')).toBeNull();
    expect(query('.media__placeholder')).not.toBeNull();
    el.image = '/ok.jpg';
    await el.updateComplete;
    expect(query('.media img')?.getAttribute('src')).toBe('/ok.jpg');
  });
});

describe('sky-feature-card slotted actions', () => {
  it("tints buttons in the actions slot with the card's accent role, like the built-in CTA", () => {
    const css = SkyFeatureCard.styles.toString();
    expect(css).toMatch(/slot\[name='actions'\]::slotted\(\*\)\s*\{[^}]*--md-filled-button-container-color: var\(--_accent\)/);
    expect(css).toMatch(/--md-text-button-label-text-color: var\(--_accent\)/);
  });
});

describe('sky-feature-card media', () => {
  it('renders no media frame without an image', async () => {
    const el = await create<SkyFeatureCard>('sky-feature-card', { headline: 'Gift cards' });
    expect(el.shadowRoot?.querySelector('.media')).toBeNull();
  });
});
