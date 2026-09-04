import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-card.js';
import { SkyCard } from './sky-card.js';

installMaterialJsdomPolyfills();

function createElement(): SkyCard {
  const el = document.createElement('sky-card') as SkyCard;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-card', () => {
  describe('renders', () => {
    it('renders with default filled variant', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.variant).toBe('filled');
    });

    it('renders slot content', async () => {
      const el = createElement();
      el.innerHTML = '<p>Card content</p>';
      await el.updateComplete;
      expect(el.querySelector('p')?.textContent).toBe('Card content');
    });

    it('reflects variant attribute on the host', async () => {
      const el = createElement();
      el.variant = 'outlined';
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('outlined');
    });
  });

  describe('variant prop', () => {
    it('accepts outlined variant', async () => {
      const el = createElement();
      el.variant = 'outlined';
      await el.updateComplete;
      expect(el.variant).toBe('outlined');
      expect(el.getAttribute('variant')).toBe('outlined');
    });

    it('accepts elevated variant', async () => {
      const el = createElement();
      el.variant = 'elevated';
      await el.updateComplete;
      expect(el.variant).toBe('elevated');
      expect(el.getAttribute('variant')).toBe('elevated');
    });

    it('changes variant when attribute is updated', async () => {
      const el = createElement();
      el.setAttribute('variant', 'elevated');
      await el.updateComplete;
      expect(el.variant).toBe('elevated');
    });

    it('reverts to filled when variant attribute is removed', async () => {
      const el = createElement();
      el.variant = 'outlined';
      await el.updateComplete;
      el.variant = 'filled';
      await el.updateComplete;
      expect(el.variant).toBe('filled');
    });
  });

  describe('shadow DOM', () => {
    it('renders a slot in the shadow root', async () => {
      const el = createElement();
      await el.updateComplete;
      const slot = el.shadowRoot?.querySelector('slot');
      expect(slot).toBeTruthy();
    });
  });
});
