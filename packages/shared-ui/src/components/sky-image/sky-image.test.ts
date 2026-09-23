import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-image.js';
import { SkyImage } from './sky-image.js';

installMaterialJsdomPolyfills();

async function create(props: Partial<SkyImage> = {}): Promise<SkyImage> {
  const el = document.createElement('sky-image') as SkyImage;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-image', () => {
  it('reflects M3 defaults (surface / filled / medium / cover)', async () => {
    const el = await create();
    expect(el.getAttribute('color')).toBe('surface');
    expect(el.getAttribute('variant')).toBe('filled');
    expect(el.getAttribute('shape')).toBe('medium');
    expect(el.getAttribute('fit')).toBe('cover');
  });

  it('renders the image with its alt text inside a figure', async () => {
    const el = await create({ src: '/logo.png', alt: 'My Spa Deal' });
    const img = el.shadowRoot?.querySelector('figure img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/logo.png');
    expect(img.alt).toBe('My Spa Deal');
  });

  it('shows a labelled placeholder when there is no src', async () => {
    const el = await create({ alt: 'Photo coming soon' });
    expect(el.shadowRoot?.querySelector('img')).toBeNull();
    const placeholder = el.shadowRoot?.querySelector('[role="img"]');
    expect(placeholder?.getAttribute('aria-label')).toBe('Photo coming soon');
    expect(el.shadowRoot?.querySelector('md-icon')?.textContent?.trim()).toBe('image');
  });

  it('falls back to the placeholder when the image fails to load', async () => {
    const el = await create({ src: '/missing.jpg', alt: 'Broken', placeholderIcon: 'broken_image' });
    el.shadowRoot?.querySelector('img')?.dispatchEvent(new Event('error'));
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('img')).toBeNull();
    expect(el.shadowRoot?.querySelector('md-icon')?.textContent?.trim()).toBe('broken_image');
  });

  it('renders one labelled link with a state layer when href is set', async () => {
    const el = await create({ src: '/logo.png', alt: 'My Spa Deal', label: 'Go home', href: '/' });
    const link = el.shadowRoot?.querySelector('a.stretch');
    expect(link?.getAttribute('href')).toBe('/');
    expect(link?.getAttribute('aria-label')).toBe('Go home');
    expect(link?.querySelector('md-ripple')).toBeTruthy();
    expect(link?.querySelector('md-focus-ring')).toBeTruthy();
    // The link carries the name, so the image does not repeat it.
    expect((el.shadowRoot?.querySelector('img') as HTMLImageElement).alt).toBe('');
  });

  it('renders no link without href', async () => {
    const el = await create({ src: '/logo.png', alt: 'Logo' });
    expect(el.shadowRoot?.querySelector('a')).toBeNull();
  });
});
