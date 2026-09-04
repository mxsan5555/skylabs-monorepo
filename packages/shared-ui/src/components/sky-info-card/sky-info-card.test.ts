import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-info-card.js';
import { SkyInfoCard } from './sky-info-card.js';

installMaterialJsdomPolyfills();

function createElement(): SkyInfoCard {
  const el = document.createElement('sky-info-card') as SkyInfoCard;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-info-card', () => {
  describe('renders', () => {
    it('renders with default align', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.align).toBe('left');
    });

    it('renders an article as the root element', async () => {
      const el = createElement();
      await el.updateComplete;
      const article = el.shadowRoot?.querySelector('article.card');
      expect(article).toBeTruthy();
    });

    it('renders heading in an h3', async () => {
      const el = createElement();
      el.heading = 'Trusted 24/7 customer service';
      await el.updateComplete;
      const h3 = el.shadowRoot?.querySelector('h3.heading');
      expect(h3?.textContent?.trim()).toBe('Trusted 24/7 customer service');
    });

    it('renders subheading in a p', async () => {
      const el = createElement();
      el.heading = 'Customer service';
      el.subheading = 'We are always here to help';
      await el.updateComplete;
      const p = el.shadowRoot?.querySelector('p.subheading');
      expect(p?.textContent?.trim()).toBe('We are always here to help');
    });

    it('does not render h3 when heading is not set', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('h3')).toBeNull();
    });

    it('does not render p when subheading is not set', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('p.subheading')).toBeNull();
    });
  });

  describe('icon prop', () => {
    it('renders md-icon with aria-hidden when icon is set', async () => {
      const el = createElement();
      el.icon = 'support_agent';
      await el.updateComplete;
      const icon = el.shadowRoot?.querySelector('md-icon');
      expect(icon).toBeTruthy();
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.textContent?.trim()).toBe('support_agent');
    });

    it('does not render md-icon in the default slot area when icon is not set', async () => {
      const el = createElement();
      await el.updateComplete;
      // The slot wrapper is always present; the md-icon inside it is not
      const icon = el.shadowRoot?.querySelector('md-icon');
      expect(icon).toBeNull();
    });
  });

  describe('media slot', () => {
    it('renders slotted media content', async () => {
      const el = createElement();
      const img = document.createElement('img');
      img.src = 'https://example.com/illustration.svg';
      img.alt = 'Illustration';
      img.slot = 'media';
      el.appendChild(img);
      await el.updateComplete;
      const slottedImg = el.querySelector('img[slot="media"]') as HTMLImageElement;
      expect(slottedImg).toBeTruthy();
      expect(slottedImg.alt).toBe('Illustration');
    });

    it('renders a named media slot in shadow root', async () => {
      const el = createElement();
      await el.updateComplete;
      const slot = el.shadowRoot?.querySelector('slot[name="media"]');
      expect(slot).toBeTruthy();
    });
  });

  describe('align prop', () => {
    it('reflects center align attribute on host', async () => {
      const el = createElement();
      el.align = 'center';
      await el.updateComplete;
      expect(el.getAttribute('align')).toBe('center');
    });

    it('reflects right align attribute on host', async () => {
      const el = createElement();
      el.align = 'right';
      await el.updateComplete;
      expect(el.getAttribute('align')).toBe('right');
    });
  });
});
