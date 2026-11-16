/**
 * Rich text editor — Quill-backed `<sky-rich-text-editor>` registration.
 *
 * Quill is not a web component, and unlike Swiper (see carousel.ts) it needs
 * real document-level Selection/contenteditable behaviour, so the component
 * renders into light DOM rather than a shadow root — see the component file
 * for the full reasoning.
 *
 * This is a SEPARATE entry (not part of the main barrel) so Quill's bundle
 * only loads on pages that actually embed an editor (CMS content screens).
 *
 * @example
 * import '@skylabs-monorepo/shared-ui/editor';
 *
 * <sky-rich-text-editor label="Blog body" placeholder="Write the post…"></sky-rich-text-editor>
 */
export * from './components/sky-rich-text-editor/sky-rich-text-editor.js';
