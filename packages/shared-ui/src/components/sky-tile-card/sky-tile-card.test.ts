import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-tile-card.js';
import { SkyTileCard } from './sky-tile-card.js';

installMaterialJsdomPolyfills();

async function create(props: Partial<SkyTileCard> = {}): Promise<SkyTileCard> {
  const el = document.createElement('sky-tile-card') as SkyTileCard;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-tile-card', () => {
  it('reflects M3 defaults (surface / outlined / large, filled medium icon)', async () => {
    const el = await create();
    expect(el.getAttribute('color')).toBe('surface');
    expect(el.getAttribute('variant')).toBe('outlined');
    expect(el.getAttribute('shape')).toBe('large');
    expect(el.getAttribute('icon-style')).toBe('filled');
    expect(el.getAttribute('icon-shape')).toBe('medium');
  });

  it('renders icon, h3 headline and supporting text in an article', async () => {
    const el = await create({ icon: 'healing', headline: 'Therapy', text: '12 deals' });
    const root = el.shadowRoot;
    expect(root?.querySelector('article .icon md-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.querySelector('h3')?.textContent).toBe('Therapy');
    expect(root?.querySelector('p')?.textContent).toBe('12 deals');
  });

  it('omits the icon container when no icon is set', async () => {
    const el = await create({ headline: 'No icon' });
    expect(el.shadowRoot?.querySelector('.icon')).toBeNull();
  });

  it('renders one stretched link named by headline + text when href is set', async () => {
    const el = await create({ headline: 'Therapy', text: '12 deals', href: '/category/therapy' });
    const link = el.shadowRoot?.querySelector('a.stretch');
    expect(link?.getAttribute('href')).toBe('/category/therapy');
    expect(link?.getAttribute('aria-labelledby')).toBe('headline text');
    expect(link?.querySelector('md-ripple')).toBeTruthy();
  });

  it('reflects option attributes for styling', async () => {
    const el = await create({ color: 'inverse', variant: 'elevated', iconStyle: 'tonal', align: 'center' });
    expect(el.getAttribute('color')).toBe('inverse');
    expect(el.getAttribute('variant')).toBe('elevated');
    expect(el.getAttribute('icon-style')).toBe('tonal');
    expect(el.getAttribute('align')).toBe('center');
  });

  it('renders slotted headline content in place of the headline prop', async () => {
    const el = await create();
    const h3 = document.createElement('h3');
    h3.slot = 'headline';
    h3.textContent = 'Massage';
    el.appendChild(h3);
    await el.updateComplete;
    const slot = el.shadowRoot?.querySelector('slot[name="headline"]') as HTMLSlotElement;
    expect(slot).toBeTruthy();
    expect(slot.assignedElements()[0]).toBe(h3);
  });

  it('still renders the headline prop as the slot fallback', async () => {
    const el = await create({ headline: 'Spa' });
    expect(el.shadowRoot?.querySelector('slot[name="headline"] h3')?.textContent).toBe('Spa');
  });
});
