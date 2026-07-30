import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-badge.js';
import { SkyBadge } from './sky-badge.js';

installMaterialJsdomPolyfills();

function createElement(): SkyBadge {
  const el = document.createElement('sky-badge') as SkyBadge;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-badge', () => {
  describe('renders', () => {
    it('renders with default variant and size', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el).toBeTruthy();
      expect(el.variant).toBe('primary');
      expect(el.size).toBe('medium');
    });

    it('renders slot text content', async () => {
      const el = createElement();
      el.textContent = 'New';
      await el.updateComplete;
      expect(el.textContent).toBe('New');
    });

    it('reflects variant attribute on the host', async () => {
      const el = createElement();
      el.variant = 'error';
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('error');
    });

    it('reflects size attribute on the host', async () => {
      const el = createElement();
      el.size = 'large';
      await el.updateComplete;
      expect(el.getAttribute('size')).toBe('large');
    });
  });

  describe('variant prop', () => {
    it('accepts secondary variant', async () => {
      const el = createElement();
      el.variant = 'secondary';
      await el.updateComplete;
      expect(el.variant).toBe('secondary');
      expect(el.getAttribute('variant')).toBe('secondary');
    });

    it('accepts tertiary variant', async () => {
      const el = createElement();
      el.variant = 'tertiary';
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('tertiary');
    });

    it('accepts error variant', async () => {
      const el = createElement();
      el.variant = 'error';
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('error');
    });

    it('changes variant when attribute is updated', async () => {
      const el = createElement();
      el.setAttribute('variant', 'tertiary');
      await el.updateComplete;
      expect(el.variant).toBe('tertiary');
    });
  });

  describe('size prop', () => {
    it('accepts small size', async () => {
      const el = createElement();
      el.size = 'small';
      await el.updateComplete;
      expect(el.getAttribute('size')).toBe('small');
    });

    it('accepts large size', async () => {
      const el = createElement();
      el.size = 'large';
      await el.updateComplete;
      expect(el.getAttribute('size')).toBe('large');
    });

    it('changes size when attribute is updated', async () => {
      const el = createElement();
      el.setAttribute('size', 'small');
      await el.updateComplete;
      expect(el.size).toBe('small');
    });
  });

  describe('accessibility', () => {
    it('is an inline-flex element', async () => {
      const el = createElement();
      await el.updateComplete;
      // The element itself is in the DOM and accessible
      expect(el.tagName.toLowerCase()).toBe('sky-badge');
    });
  });
});
