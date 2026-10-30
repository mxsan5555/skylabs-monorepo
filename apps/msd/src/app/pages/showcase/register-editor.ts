/**
 * Registers <sky-rich-text-editor> (Quill-backed). The showcase loads this file lazily, in the
 * browser only: Quill reads `document` when imported, so a static import would break the server
 * render. This file exists so the lazy import targets app code; importing the shared-ui entry
 * lazily would mark the whole shared-ui library lazy-loaded and forbid its static imports.
 */
import '@skylabs-monorepo/shared-ui/editor';
