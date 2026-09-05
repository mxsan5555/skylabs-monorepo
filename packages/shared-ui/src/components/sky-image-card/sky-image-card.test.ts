import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-image-card.js';
import { SkyImageCard } from './sky-image-card.js';

installMaterialJsdomPolyfills();

function createElement(): SkyImageCard {
  const el = document.createElement('sky-image-card') as SkyImageCard;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-image-card', () => {
  describe('renders', () => {
    it('renders with default props', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.ratio).toBe('3 / 4');
      expect(el.align).toBe('left');
    });

    it('renders a figure as the root element', async () => {
      const el = createElement();
      await el.updateComplete;
      const figure = el.shadowRoot?.querySelector('figure.card');
      expect(figure).toBeTruthy();
    });

    it('renders image with alt from prop', async () => {
      const el = createElement();
      el.image = 'https://example.com/cottage.jpg';
      el.imageAlt = 'Cottage garden';
      await el.updateComplete;
      const img = el.shadowRoot?.querySelector('figure img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.alt).toBe('Cottage garden');
      expect(img.src).toContain('cottage.jpg');
    });

    it('does not render img when image prop is not set', async () => {
      const el = createElement();
      await el.updateComplete;
      const img = el.shadowRoot?.querySelector('img');
      expect(img).toBeNull();
    });

    it('renders label as figcaption', async () => {
      const el = createElement();
      el.label = 'Cottages';
      await el.updateComplete;
      const caption = el.shadowRoot?.querySelector('figcaption.label');
      expect(caption?.textContent?.trim()).toBe('Cottages');
    });

    it('does not render figcaption when label is not set', async () => {
      const el = createElement();
      await el.updateComplete;
      const caption = el.shadowRoot?.querySelector('figcaption');
      expect(caption).toBeNull();
    });
  });

  describe('href prop', () => {
    it('renders a stretched anchor when href is set', async () => {
      const el = createElement();
      el.href = '/stays/cottages';
      el.label = 'Cottages';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch') as HTMLAnchorElement;
      expect(anchor).toBeTruthy();
      expect(anchor.getAttribute('href')).toBe('/stays/cottages');
    });

    it('anchor aria-label uses label when both label and imageAlt are set', async () => {
      const el = createElement();
      el.href = '/stays/cottages';
      el.label = 'Cottages';
      el.imageAlt = 'Cottage garden';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor?.getAttribute('aria-label')).toBe('Cottages');
    });

    it('anchor aria-label falls back to imageAlt when label is not set', async () => {
      const el = createElement();
      el.href = '/stays/cottages';
      el.imageAlt = 'Cottage garden';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor?.getAttribute('aria-label')).toBe('Cottage garden');
    });

    it('anchor aria-label falls back to View when neither label nor imageAlt set', async () => {
      const el = createElement();
      el.href = '/stays/cottages';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor?.getAttribute('aria-label')).toBe('View');
    });

    it('does not render anchor when href is not set', async () => {
      const el = createElement();
      el.label = 'Cottages';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor).toBeNull();
    });
  });

  describe('ratio prop', () => {
    it('applies ratio as inline style on the figure', async () => {
      const el = createElement();
      el.ratio = '16 / 9';
      await el.updateComplete;
      const figure = el.shadowRoot?.querySelector('figure.card') as HTMLElement;
      expect(figure?.getAttribute('style')).toContain('16 / 9');
    });

    it('uses default ratio 3 / 4 when not set', async () => {
      const el = createElement();
      await el.updateComplete;
      const figure = el.shadowRoot?.querySelector('figure.card') as HTMLElement;
      expect(figure?.getAttribute('style')).toContain('3 / 4');
    });
  });

  describe('align prop', () => {
    it('reflects align attribute on host', async () => {
      const el = createElement();
      el.align = 'center';
      await el.updateComplete;
      expect(el.getAttribute('align')).toBe('center');
    });
  });
});
