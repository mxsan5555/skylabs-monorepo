import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-accordion-item.js';
import { SkyAccordionItem } from './sky-accordion-item.js';

installMaterialJsdomPolyfills();

function createElement(): SkyAccordionItem {
  const el = document.createElement('sky-accordion-item') as SkyAccordionItem;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-accordion-item', () => {
  describe('renders', () => {
    it('renders with default props', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.open).toBe(false);
      expect(el.disabled).toBe(false);
      expect(el.variant).toBe('outlined');
      expect(el.level).toBe(3);
    });

    it('renders a trigger button in shadow root', async () => {
      const el = createElement();
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger');
      expect(btn).toBeTruthy();
    });

    it('renders heading text from header prop', async () => {
      const el = createElement();
      el.header = 'Accordion 1';
      await el.updateComplete;
      const slot = el.shadowRoot?.querySelector('slot[name="header"]') as HTMLSlotElement;
      expect(slot).toBeTruthy();
    });

    it('renders a panel region in shadow root', async () => {
      const el = createElement();
      await el.updateComplete;
      const panel = el.shadowRoot?.querySelector('[role="region"]');
      expect(panel).toBeTruthy();
    });
  });

  describe('open prop', () => {
    it('panel is hidden when open is false', async () => {
      const el = createElement();
      el.open = false;
      await el.updateComplete;
      const panel = el.shadowRoot?.querySelector('.panel') as HTMLElement;
      expect(panel?.hidden).toBe(true);
    });

    it('panel is visible when open is true', async () => {
      const el = createElement();
      el.open = true;
      await el.updateComplete;
      const panel = el.shadowRoot?.querySelector('.panel') as HTMLElement;
      expect(panel?.hidden).toBe(false);
    });

    it('reflects open attribute on host', async () => {
      const el = createElement();
      el.open = true;
      await el.updateComplete;
      expect(el.getAttribute('open')).not.toBeNull();
    });
  });

  describe('accessibility', () => {
    it('trigger button has aria-expanded=false when closed', async () => {
      const el = createElement();
      el.open = false;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger');
      expect(btn?.getAttribute('aria-expanded')).toBe('false');
    });

    it('trigger button has aria-expanded=true when open', async () => {
      const el = createElement();
      el.open = true;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger');
      expect(btn?.getAttribute('aria-expanded')).toBe('true');
    });

    it('trigger button has aria-controls pointing to panel id', async () => {
      const el = createElement();
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger');
      const panel = el.shadowRoot?.querySelector('.panel');
      expect(btn?.getAttribute('aria-controls')).toBeTruthy();
      expect(btn?.getAttribute('aria-controls')).toBe(panel?.getAttribute('id'));
    });

    it('panel has role=region', async () => {
      const el = createElement();
      await el.updateComplete;
      const panel = el.shadowRoot?.querySelector('.panel');
      expect(panel?.getAttribute('role')).toBe('region');
    });

    it('panel has aria-labelledby pointing to trigger id', async () => {
      const el = createElement();
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger');
      const panel = el.shadowRoot?.querySelector('.panel');
      expect(panel?.getAttribute('aria-labelledby')).toBeTruthy();
      expect(panel?.getAttribute('aria-labelledby')).toBe(btn?.getAttribute('id'));
    });

    it('heading wrapper has role=heading with aria-level', async () => {
      const el = createElement();
      el.level = 2;
      await el.updateComplete;
      const heading = el.shadowRoot?.querySelector('[role="heading"]');
      expect(heading?.getAttribute('aria-level')).toBe('2');
    });

    it('chevron icon has aria-hidden=true', async () => {
      const el = createElement();
      await el.updateComplete;
      const chevron = el.shadowRoot?.querySelector('md-icon.chevron');
      expect(chevron?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('toggle behaviour', () => {
    it('clicking trigger toggles open from false to true', async () => {
      const el = createElement();
      el.open = false;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger') as HTMLButtonElement;
      btn.click();
      await el.updateComplete;
      expect(el.open).toBe(true);
    });

    it('clicking trigger toggles open from true to false', async () => {
      const el = createElement();
      el.open = true;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger') as HTMLButtonElement;
      btn.click();
      await el.updateComplete;
      expect(el.open).toBe(false);
    });

    it('fires toggle CustomEvent with correct detail on click', async () => {
      const el = createElement();
      el.open = false;
      await el.updateComplete;

      const events: CustomEvent[] = [];
      el.addEventListener('toggle', (e) => events.push(e as CustomEvent));

      const btn = el.shadowRoot?.querySelector('button.trigger') as HTMLButtonElement;
      btn.click();
      await el.updateComplete;

      expect(events.length).toBe(1);
      expect(events[0].detail).toHaveProperty('open', true);
    });

    it('does not toggle when disabled', async () => {
      const el = createElement();
      el.disabled = true;
      el.open = false;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger') as HTMLButtonElement;
      btn.click();
      await el.updateComplete;
      expect(el.open).toBe(false);
    });
  });

  describe('variant prop', () => {
    it('accepts filled variant and reflects attribute', async () => {
      const el = createElement();
      el.variant = 'filled';
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('filled');
    });

    it('accepts elevated variant and reflects attribute', async () => {
      const el = createElement();
      el.variant = 'elevated';
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('elevated');
    });

    it('defaults to outlined variant', async () => {
      const el = createElement();
      await el.updateComplete;
      expect(el.getAttribute('variant')).toBe('outlined');
    });
  });

  describe('disabled prop', () => {
    it('reflects disabled attribute on host', async () => {
      const el = createElement();
      el.disabled = true;
      await el.updateComplete;
      expect(el.getAttribute('disabled')).not.toBeNull();
    });

    it('trigger button has disabled attribute when item is disabled', async () => {
      const el = createElement();
      el.disabled = true;
      await el.updateComplete;
      const btn = el.shadowRoot?.querySelector('button.trigger') as HTMLButtonElement;
      expect(btn?.disabled).toBe(true);
    });
  });
});
