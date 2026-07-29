import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-accordion.js';
import { SkyAccordion } from './sky-accordion.js';
import { SkyAccordionItem } from './sky-accordion-item.js';

installMaterialJsdomPolyfills();

function createElement(): SkyAccordion {
  const el = document.createElement('sky-accordion') as SkyAccordion;
  document.body.appendChild(el);
  return el;
}

function createItemIn(accordion: SkyAccordion): SkyAccordionItem {
  const item = document.createElement('sky-accordion-item') as SkyAccordionItem;
  accordion.appendChild(item);
  return item;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-accordion', () => {
  describe('renders', () => {
    it('renders with single=false by default', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.single).toBe(false);
    });

    it('renders a slot in shadow root', async () => {
      const el = createElement();
      await el.updateComplete;
      const slot = el.shadowRoot?.querySelector('slot');
      expect(slot).toBeTruthy();
    });
  });

  describe('single prop', () => {
    it('accepts single attribute', async () => {
      const el = createElement();
      el.single = true;
      await el.updateComplete;
      expect(el.single).toBe(true);
      expect(el.getAttribute('single')).not.toBeNull();
    });

    it('reflects single attribute on the host', async () => {
      const el = createElement();
      el.setAttribute('single', '');
      await el.updateComplete;
      expect(el.single).toBe(true);
    });

    it('removes single attribute when set to false', async () => {
      const el = createElement();
      el.single = true;
      await el.updateComplete;
      el.single = false;
      await el.updateComplete;
      expect(el.single).toBe(false);
    });
  });

  describe('single-open mode', () => {
    it('closes other items when one opens in single mode', async () => {
      const el = createElement();
      el.single = true;
      const item1 = createItemIn(el);
      const item2 = createItemIn(el);
      item1.header = 'Item 1';
      item2.header = 'Item 2';
      await el.updateComplete;
      await item1.updateComplete;
      await item2.updateComplete;

      // Open item1
      item1.open = true;
      item1.dispatchEvent(
        new CustomEvent('toggle', {
          detail: { open: true },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;
      await item2.updateComplete;

      expect(item1.open).toBe(true);
      expect(item2.open).toBe(false);
    });

    it('allows both items open when single is false', async () => {
      const el = createElement();
      el.single = false;
      const item1 = createItemIn(el);
      const item2 = createItemIn(el);
      item1.header = 'Item 1';
      item2.header = 'Item 2';
      await el.updateComplete;
      await item1.updateComplete;
      await item2.updateComplete;

      item1.open = true;
      item2.open = true;
      await el.updateComplete;

      expect(item1.open).toBe(true);
      expect(item2.open).toBe(true);
    });

    it('does not close siblings when a close event fires', async () => {
      const el = createElement();
      el.single = true;
      const item1 = createItemIn(el);
      const item2 = createItemIn(el);
      item1.open = true;
      item2.open = true;
      await el.updateComplete;
      await item1.updateComplete;
      await item2.updateComplete;

      // Closing item1 — the toggle listener only reacts to open:true
      item1.open = false;
      item1.dispatchEvent(
        new CustomEvent('toggle', {
          detail: { open: false },
          bubbles: true,
          composed: true,
        }),
      );
      await el.updateComplete;

      // item2 must remain open — we only close siblings when a new item opens
      expect(item2.open).toBe(true);
    });
  });

  describe('light DOM children', () => {
    it('projects accordion-item children via slot', async () => {
      const el = createElement();
      const item = createItemIn(el);
      item.header = 'Slotted item';
      await el.updateComplete;
      await item.updateComplete;
      expect(el.querySelector('sky-accordion-item')).toBeTruthy();
    });
  });
});
