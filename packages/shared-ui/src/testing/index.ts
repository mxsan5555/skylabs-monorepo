/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-explicit-any */
/**
 * Test setup for apps that render Material 3 web components under jsdom.
 *
 * Several M3 elements (dialog, menu, slider, tabs, form controls) call browser
 * APIs that jsdom does not implement. Importing/running this module installs
 * stubs for them, so reference it directly as a test setup file:
 *
 *   // msd vite.config.mts
 *   test: { setupFiles: ['../../packages/shared-ui/src/testing/index.ts'] }
 *
 *   // mera-driver project.json
 *   "test": { "options": { "setupFiles": ["packages/shared-ui/src/testing/index.ts"] } }
 *
 * The installer is also exported for explicit use inside a spec if needed.
 */

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

export function installMaterialJsdomPolyfills(): void {
  if (!('IntersectionObserver' in globalThis)) {
    (globalThis as any).IntersectionObserver = NoopObserver;
  }
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = NoopObserver;
  }

  if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
    Element.prototype.scrollTo = function scrollTo() {};
    Element.prototype.scrollBy = function scrollBy() {};
  }

  if (typeof Element !== 'undefined' && !Element.prototype.animate) {
    Element.prototype.animate = function animate() {
      return {
        cancel() {},
        finish() {},
        addEventListener() {},
        removeEventListener() {},
        finished: Promise.resolve(),
        onfinish: null,
        oncancel: null,
      } as unknown as Animation;
    };
  }

  // Form-associated custom elements (checkbox, switch, radio, text field, ...)
  // call attachInternals(), which jsdom does not implement.
  if (
    typeof HTMLElement !== 'undefined' &&
    !HTMLElement.prototype.attachInternals
  ) {
    HTMLElement.prototype.attachInternals = function attachInternals() {
      return {
        setFormValue() {},
        setValidity() {},
        checkValidity() {
          return true;
        },
        reportValidity() {
          return true;
        },
        states: new Set<string>(),
        form: null,
        labels: [] as unknown as NodeList,
        validity: {} as ValidityState,
        validationMessage: '',
        willValidate: true,
        role: null,
      } as unknown as ElementInternals;
    };
  }

  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }) as unknown as MediaQueryList;
  }
}

// Run on import so this file works as a test setup entry on its own.
installMaterialJsdomPolyfills();
