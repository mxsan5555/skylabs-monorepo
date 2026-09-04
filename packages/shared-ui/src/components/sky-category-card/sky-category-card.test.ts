import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-category-card.js';
import { SkyCategoryCard } from './sky-category-card.js';

installMaterialJsdomPolyfills();

function createElement(): SkyCategoryCard {
  const el = document.createElement('sky-category-card') as SkyCategoryCard;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-category-card', () => {
  describe('renders', () => {
    it('renders with default align', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.align).toBe('left');
    });

    it('renders a figure as the root element', async () => {
      const el = createElement();
      await el.updateComplete;
      const figure = el.shadowRoot?.querySelector('figure.card');
      expect(figure).toBeTruthy();
    });

    it('renders heading in an h3', async () => {
      const el = createElement();
      el.heading = 'Los Angeles';
      await el.updateComplete;
      const h3 = el.shadowRoot?.querySelector('h3.heading');
      expect(h3?.textContent?.trim()).toBe('Los Angeles');
    });

    it('renders subheading in a p', async () => {
      const el = createElement();
      el.heading = 'Los Angeles';
      el.subheading = '4,781 properties';
      await el.updateComplete;
      const p = el.shadowRoot?.querySelector('p.subheading');
      expect(p?.textContent?.trim()).toBe('4,781 properties');
    });

    it('wraps heading and subheading in figcaption', async () => {
      const el = createElement();
      el.heading = 'Los Angeles';
      el.subheading = '4,781 properties';
      await el.updateComplete;
      const caption = el.shadowRoot?.querySelector('figcaption');
      expect(caption).toBeTruthy();
      expect(caption?.querySelector('h3')).toBeTruthy();
      expect(caption?.querySelector('p')).toBeTruthy();
    });

    it('does not render figcaption when neither heading nor subheading set', async () => {
      const el = createElement();
      await el.updateComplete;
      const caption = el.shadowRoot?.querySelector('figcaption');
      expect(caption).toBeNull();
    });

    it('renders image with alt from prop', async () => {
      const el = createElement();
      el.image = 'https://example.com/la.jpg';
      el.imageAlt = 'Hollywood sign';
      await el.updateComplete;
      const img = el.shadowRoot?.querySelector('.media img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.alt).toBe('Hollywood sign');
    });

    it('does not render img when image is not set', async () => {
      const el = createElement();
      await el.updateComplete;
      const img = el.shadowRoot?.querySelector('img');
      expect(img).toBeNull();
    });
  });

  describe('href prop', () => {
    it('renders a stretched anchor when href is set', async () => {
      const el = createElement();
      el.href = '/city/los-angeles';
      el.heading = 'Los Angeles';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch') as HTMLAnchorElement;
      expect(anchor).toBeTruthy();
      expect(anchor.getAttribute('href')).toBe('/city/los-angeles');
    });

    it('anchor aria-label uses heading', async () => {
      const el = createElement();
      el.href = '/city/los-angeles';
      el.heading = 'Los Angeles';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor?.getAttribute('aria-label')).toBe('Los Angeles');
    });

    it('anchor aria-label falls back to imageAlt when heading is not set', async () => {
      const el = createElement();
      el.href = '/city/los-angeles';
      el.imageAlt = 'Hollywood sign';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor?.getAttribute('aria-label')).toBe('Hollywood sign');
    });

    it('anchor aria-label falls back to View when neither heading nor imageAlt set', async () => {
      const el = createElement();
      el.href = '/city/los-angeles';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor?.getAttribute('aria-label')).toBe('View');
    });

    it('does not render anchor when href is not set', async () => {
      const el = createElement();
      el.heading = 'Los Angeles';
      await el.updateComplete;
      const anchor = el.shadowRoot?.querySelector('a.stretch');
      expect(anchor).toBeNull();
    });
  });

  describe('tag prop', () => {
    it('renders a tag pill over the image when set', async () => {
      const el = createElement();
      el.image = 'https://example.com/la.jpg';
      el.tag = 'Trending';
      await el.updateComplete;
      const tag = el.shadowRoot?.querySelector('.media .tag');
      expect(tag?.textContent?.trim()).toBe('Trending');
    });

    it('does not render a tag pill when unset', async () => {
      const el = createElement();
      el.image = 'https://example.com/la.jpg';
      await el.updateComplete;
      const tag = el.shadowRoot?.querySelector('.media .tag');
      expect(tag).toBeNull();
    });
  });

  describe('align prop', () => {
    it('reflects align attribute on host', async () => {
      const el = createElement();
      el.align = 'center';
      await el.updateComplete;
      expect(el.getAttribute('align')).toBe('center');
    });

    it('reflects right align', async () => {
      const el = createElement();
      el.align = 'right';
      await el.updateComplete;
      expect(el.getAttribute('align')).toBe('right');
    });
  });
});
