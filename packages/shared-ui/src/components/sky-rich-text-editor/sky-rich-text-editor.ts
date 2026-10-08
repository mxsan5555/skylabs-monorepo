import { LitElement, html, type PropertyValues } from 'lit';
import Quill from 'quill';
import '@material/web/icon/icon.js';
import '@material/web/iconbutton/icon-button.js';

type QuillFormats = Record<string, unknown>;

const STYLE_ID = 'sky-rich-text-editor-styles';

/**
 * Vendored verbatim from `quill/dist/quill.core.css` (Quill 2.0.3) — the
 * structural rules Quill's Parchment blots need (editor box, list counters,
 * indent, code block, placeholder), with no toolbar/tooltip theme attached.
 * Inlined as a string rather than imported: the file is minified single-line
 * CSS pinned to our Quill version, and a direct import would need a bundler
 * CSS-as-string loader wired into every consumer (Vite/Vitest) instead of
 * working out of the box like every other `sky-*` component. Re-vendor this
 * if the `quill` dependency version bumps.
 */
const QUILL_CORE_CSS =
  ".ql-container{box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;font-size:13px;height:100%;margin:0;position:relative}.ql-container.ql-disabled .ql-tooltip{visibility:hidden}.ql-container:not(.ql-disabled) li[data-list=checked] > .ql-ui,.ql-container:not(.ql-disabled) li[data-list=unchecked] > .ql-ui{cursor:pointer}.ql-clipboard{left:-100000px;height:1px;overflow-y:hidden;position:absolute;top:50%}.ql-clipboard p{margin:0;padding:0}.ql-editor{box-sizing:border-box;counter-reset:list-0 list-1 list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9;line-height:1.42;height:100%;outline:none;overflow-y:auto;padding:12px 15px;tab-size:4;-moz-tab-size:4;text-align:left;white-space:pre-wrap;word-wrap:break-word}.ql-editor > *{cursor:text}.ql-editor p,.ql-editor ol,.ql-editor pre,.ql-editor blockquote,.ql-editor h1,.ql-editor h2,.ql-editor h3,.ql-editor h4,.ql-editor h5,.ql-editor h6{margin:0;padding:0}@supports (counter-set:none){.ql-editor p,.ql-editor h1,.ql-editor h2,.ql-editor h3,.ql-editor h4,.ql-editor h5,.ql-editor h6{counter-set:list-0 list-1 list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor p,.ql-editor h1,.ql-editor h2,.ql-editor h3,.ql-editor h4,.ql-editor h5,.ql-editor h6{counter-reset:list-0 list-1 list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9}}.ql-editor table{border-collapse:collapse}.ql-editor td{border:1px solid #000;padding:2px 5px}.ql-editor ol{padding-left:1.5em}.ql-editor li{list-style-type:none;padding-left:1.5em;position:relative}.ql-editor li > .ql-ui:before{display:inline-block;margin-left:-1.5em;margin-right:.3em;text-align:right;white-space:nowrap;width:1.2em}.ql-editor li[data-list=checked] > .ql-ui,.ql-editor li[data-list=unchecked] > .ql-ui{color:#777}.ql-editor li[data-list=bullet] > .ql-ui:before{content:'\\2022'}.ql-editor li[data-list=checked] > .ql-ui:before{content:'\\2611'}.ql-editor li[data-list=unchecked] > .ql-ui:before{content:'\\2610'}@supports (counter-set:none){.ql-editor li[data-list]{counter-set:list-1 list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list]{counter-reset:list-1 list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9}}.ql-editor li[data-list=ordered]{counter-increment:list-0}.ql-editor li[data-list=ordered] > .ql-ui:before{content:counter(list-0, decimal) '. '}.ql-editor li[data-list=ordered].ql-indent-1{counter-increment:list-1}.ql-editor li[data-list=ordered].ql-indent-1 > .ql-ui:before{content:counter(list-1, lower-alpha) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-1{counter-set:list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-1{counter-reset:list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9}}.ql-editor li[data-list=ordered].ql-indent-2{counter-increment:list-2}.ql-editor li[data-list=ordered].ql-indent-2 > .ql-ui:before{content:counter(list-2, lower-roman) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-2{counter-set:list-3 list-4 list-5 list-6 list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-2{counter-reset:list-3 list-4 list-5 list-6 list-7 list-8 list-9}}.ql-editor li[data-list=ordered].ql-indent-3{counter-increment:list-3}.ql-editor li[data-list=ordered].ql-indent-3 > .ql-ui:before{content:counter(list-3, decimal) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-3{counter-set:list-4 list-5 list-6 list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-3{counter-reset:list-4 list-5 list-6 list-7 list-8 list-9}}.ql-editor li[data-list=ordered].ql-indent-4{counter-increment:list-4}.ql-editor li[data-list=ordered].ql-indent-4 > .ql-ui:before{content:counter(list-4, lower-alpha) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-4{counter-set:list-5 list-6 list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-4{counter-reset:list-5 list-6 list-7 list-8 list-9}}.ql-editor li[data-list=ordered].ql-indent-5{counter-increment:list-5}.ql-editor li[data-list=ordered].ql-indent-5 > .ql-ui:before{content:counter(list-5, lower-roman) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-5{counter-set:list-6 list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-5{counter-reset:list-6 list-7 list-8 list-9}}.ql-editor li[data-list=ordered].ql-indent-6{counter-increment:list-6}.ql-editor li[data-list=ordered].ql-indent-6 > .ql-ui:before{content:counter(list-6, decimal) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-6{counter-set:list-7 list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-6{counter-reset:list-7 list-8 list-9}}.ql-editor li[data-list=ordered].ql-indent-7{counter-increment:list-7}.ql-editor li[data-list=ordered].ql-indent-7 > .ql-ui:before{content:counter(list-7, lower-alpha) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-7{counter-set:list-8 list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-7{counter-reset:list-8 list-9}}.ql-editor li[data-list=ordered].ql-indent-8{counter-increment:list-8}.ql-editor li[data-list=ordered].ql-indent-8 > .ql-ui:before{content:counter(list-8, lower-roman) '. '}@supports (counter-set:none){.ql-editor li[data-list].ql-indent-8{counter-set:list-9}}@supports not (counter-set:none){.ql-editor li[data-list].ql-indent-8{counter-reset:list-9}}.ql-editor li[data-list=ordered].ql-indent-9{counter-increment:list-9}.ql-editor li[data-list=ordered].ql-indent-9 > .ql-ui:before{content:counter(list-9, decimal) '. '}.ql-editor .ql-indent-1:not(.ql-direction-rtl){padding-left:3em}.ql-editor li.ql-indent-1:not(.ql-direction-rtl){padding-left:4.5em}.ql-editor .ql-indent-1.ql-direction-rtl.ql-align-right{padding-right:3em}.ql-editor li.ql-indent-1.ql-direction-rtl.ql-align-right{padding-right:4.5em}.ql-editor .ql-indent-2:not(.ql-direction-rtl){padding-left:6em}.ql-editor li.ql-indent-2:not(.ql-direction-rtl){padding-left:7.5em}.ql-editor .ql-indent-2.ql-direction-rtl.ql-align-right{padding-right:6em}.ql-editor li.ql-indent-2.ql-direction-rtl.ql-align-right{padding-right:7.5em}.ql-editor .ql-indent-3:not(.ql-direction-rtl){padding-left:9em}.ql-editor li.ql-indent-3:not(.ql-direction-rtl){padding-left:10.5em}.ql-editor .ql-indent-3.ql-direction-rtl.ql-align-right{padding-right:9em}.ql-editor li.ql-indent-3.ql-direction-rtl.ql-align-right{padding-right:10.5em}.ql-editor .ql-indent-4:not(.ql-direction-rtl){padding-left:12em}.ql-editor li.ql-indent-4:not(.ql-direction-rtl){padding-left:13.5em}.ql-editor .ql-indent-4.ql-direction-rtl.ql-align-right{padding-right:12em}.ql-editor li.ql-indent-4.ql-direction-rtl.ql-align-right{padding-right:13.5em}.ql-editor .ql-indent-5:not(.ql-direction-rtl){padding-left:15em}.ql-editor li.ql-indent-5:not(.ql-direction-rtl){padding-left:16.5em}.ql-editor .ql-indent-5.ql-direction-rtl.ql-align-right{padding-right:15em}.ql-editor li.ql-indent-5.ql-direction-rtl.ql-align-right{padding-right:16.5em}.ql-editor .ql-indent-6:not(.ql-direction-rtl){padding-left:18em}.ql-editor li.ql-indent-6:not(.ql-direction-rtl){padding-left:19.5em}.ql-editor .ql-indent-6.ql-direction-rtl.ql-align-right{padding-right:18em}.ql-editor li.ql-indent-6.ql-direction-rtl.ql-align-right{padding-right:19.5em}.ql-editor .ql-indent-7:not(.ql-direction-rtl){padding-left:21em}.ql-editor li.ql-indent-7:not(.ql-direction-rtl){padding-left:22.5em}.ql-editor .ql-indent-7.ql-direction-rtl.ql-align-right{padding-right:21em}.ql-editor li.ql-indent-7.ql-direction-rtl.ql-align-right{padding-right:22.5em}.ql-editor .ql-indent-8:not(.ql-direction-rtl){padding-left:24em}.ql-editor li.ql-indent-8:not(.ql-direction-rtl){padding-left:25.5em}.ql-editor .ql-indent-8.ql-direction-rtl.ql-align-right{padding-right:24em}.ql-editor li.ql-indent-8.ql-direction-rtl.ql-align-right{padding-right:25.5em}.ql-editor .ql-indent-9:not(.ql-direction-rtl){padding-left:27em}.ql-editor li.ql-indent-9:not(.ql-direction-rtl){padding-left:28.5em}.ql-editor .ql-indent-9.ql-direction-rtl.ql-align-right{padding-right:27em}.ql-editor li.ql-indent-9.ql-direction-rtl.ql-align-right{padding-right:28.5em}.ql-editor li.ql-direction-rtl{padding-right:1.5em}.ql-editor li.ql-direction-rtl > .ql-ui:before{margin-left:.3em;margin-right:-1.5em;text-align:left}.ql-editor table{table-layout:fixed;width:100%}.ql-editor table td{outline:none}.ql-editor .ql-code-block-container{font-family:monospace}.ql-editor .ql-video{display:block;max-width:100%}.ql-editor .ql-video.ql-align-center{margin:0 auto}.ql-editor .ql-video.ql-align-right{margin:0 0 0 auto}.ql-editor .ql-bg-black{background-color:#000}.ql-editor .ql-bg-red{background-color:#e60000}.ql-editor .ql-bg-orange{background-color:#f90}.ql-editor .ql-bg-yellow{background-color:#ff0}.ql-editor .ql-bg-green{background-color:#008a00}.ql-editor .ql-bg-blue{background-color:#06c}.ql-editor .ql-bg-purple{background-color:#93f}.ql-editor .ql-color-white{color:#fff}.ql-editor .ql-color-red{color:#e60000}.ql-editor .ql-color-orange{color:#f90}.ql-editor .ql-color-yellow{color:#ff0}.ql-editor .ql-color-green{color:#008a00}.ql-editor .ql-color-blue{color:#06c}.ql-editor .ql-color-purple{color:#93f}.ql-editor .ql-font-serif{font-family:Georgia,Times New Roman,serif}.ql-editor .ql-font-monospace{font-family:Monaco,Courier New,monospace}.ql-editor .ql-size-small{font-size:.75em}.ql-editor .ql-size-large{font-size:1.5em}.ql-editor .ql-size-huge{font-size:2.5em}.ql-editor .ql-direction-rtl{direction:rtl;text-align:inherit}.ql-editor .ql-align-center{text-align:center}.ql-editor .ql-align-justify{text-align:justify}.ql-editor .ql-align-right{text-align:right}.ql-editor .ql-ui{position:absolute}.ql-editor.ql-blank::before{color:rgba(0,0,0,0.6);content:attr(data-placeholder);font-style:italic;left:15px;pointer-events:none;position:absolute;right:15px}";

/**
 * M3-tokened chrome for the toolbar/editor box, laid over Quill's own
 * structural rules. No hex values — every colour is a `--md-sys-color-*`
 * token, so the editor matches each app's generated theme automatically.
 */
const COMPONENT_CSS = `
sky-rich-text-editor {
  display: block;
  inline-size: 100%;
  box-sizing: border-box;
  font-family: var(--md-sys-typescale-body-medium-font);
  color: var(--md-sys-color-on-surface);
}
sky-rich-text-editor .sky-rte {
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-medium);
  overflow: hidden;
}
sky-rich-text-editor:focus-within .sky-rte {
  outline: 2px solid var(--md-sys-color-primary);
  outline-offset: -2px;
}
sky-rich-text-editor .sky-rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  background-color: var(--md-sys-color-surface-container-high);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
sky-rich-text-editor .sky-rte-sep {
  inline-size: 1px;
  block-size: 24px;
  margin-inline: 4px;
  background-color: var(--md-sys-color-outline-variant);
}
sky-rich-text-editor .sky-rte-btn {
  border-radius: var(--md-sys-shape-corner-small);
}
sky-rich-text-editor .sky-rte-btn--active {
  background-color: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
sky-rich-text-editor .sky-rte-editor {
  min-block-size: 200px;
  max-block-size: 480px;
  overflow-y: auto;
  background-color: var(--md-sys-color-surface);
}
sky-rich-text-editor[readonly] .sky-rte-editor {
  background-color: var(--md-sys-color-surface-container-low);
}
sky-rich-text-editor .ql-editor {
  padding: 16px;
  font-family: var(--md-sys-typescale-body-large-font);
  font-size: var(--md-sys-typescale-body-large-size);
  line-height: var(--md-sys-typescale-body-large-line-height);
}
sky-rich-text-editor .ql-editor.ql-blank::before {
  color: var(--md-sys-color-on-surface-variant);
  font-style: normal;
  opacity: 1;
}
sky-rich-text-editor .ql-editor blockquote {
  border-inline-start: 4px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface-variant);
}
sky-rich-text-editor .ql-editor a {
  color: var(--md-sys-color-primary);
}
sky-rich-text-editor .ql-editor code {
  background-color: var(--md-sys-color-surface-container-high);
  border-radius: var(--md-sys-shape-corner-extra-small);
}
`;

/** Injects Quill's structural CSS + our M3 chrome once per document, however many editors exist. */
function ensureGlobalStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${QUILL_CORE_CSS}\n${COMPONENT_CSS}`;
  document.head.appendChild(style);
}

interface ToggleSpec {
  icon: string;
  label: string;
  format: string;
  value: unknown;
}

const INLINE_TOGGLES: ToggleSpec[] = [
  { icon: 'format_bold', label: 'Bold', format: 'bold', value: true },
  { icon: 'format_italic', label: 'Italic', format: 'italic', value: true },
  { icon: 'format_underlined', label: 'Underline', format: 'underline', value: true },
  { icon: 'format_strikethrough', label: 'Strikethrough', format: 'strike', value: true },
];

const BLOCK_TOGGLES: ToggleSpec[] = [
  { icon: 'format_h2', label: 'Heading 2', format: 'header', value: 2 },
  { icon: 'format_h3', label: 'Heading 3', format: 'header', value: 3 },
];

const LIST_TOGGLES: ToggleSpec[] = [
  { icon: 'format_list_bulleted', label: 'Bulleted list', format: 'list', value: 'bullet' },
  { icon: 'format_list_numbered', label: 'Numbered list', format: 'list', value: 'ordered' },
  { icon: 'format_quote', label: 'Quote', format: 'blockquote', value: true },
];

/**
 * <sky-rich-text-editor> — basic WYSIWYG for CMS body text (blog posts, FAQ
 * answers, static pages): bold/italic/underline/strike, headings, lists,
 * blockquote, link, image, clear formatting.
 *
 * Built on Quill (core, no theme/toolbar module) with a custom M3-tokened
 * toolbar driven by Quill's own `format()`/`getFormat()` API — Quill's own
 * Snow/Bubble theme CSS is never loaded, only its minimal structural CSS
 * (`quill.core.css`) for list/blockquote/placeholder layout, re-skinned with
 * `--md-sys-color-*` tokens.
 *
 * UNLIKE every other `sky-*` component, this one renders into **light DOM**
 * (`createRenderRoot()` returns `this`), not a shadow root. Quill owns a real
 * `contenteditable` region and tracks the Selection API at the `document`
 * level; Shadow DOM's Selection boundary is still inconsistent across engines
 * (no reliable cross-boundary Range without `getComposedRange()`/
 * `shadowRoot.getSelection()`), which breaks typing/selection inside a shadow
 * root. Rendering in light DOM sidesteps that entirely. CSS is scoped by the
 * `sky-rich-text-editor` tag selector instead of shadow encapsulation.
 *
 * This is opt-in — `import '@skylabs-monorepo/shared-ui/editor'` — so Quill's
 * bundle only loads on pages that actually embed an editor.
 *
 * @prop {string}  value       — HTML content (two-way: set it, or read it from `sky-change`).
 * @prop {string}  placeholder — Shown when the editor is empty.
 * @prop {string}  label       — Accessible name for the editable region.
 * @prop {boolean} readOnly    — Disables editing and every toolbar button (attribute: `readonly`).
 *
 * @fires sky-change — CustomEvent<{ html: string; text: string }> on every content edit.
 *
 * @example
 * import '@skylabs-monorepo/shared-ui/editor';
 *
 * <sky-rich-text-editor
 *   label="Blog body"
 *   placeholder="Write the post…"
 *   value="<p>Hello</p>"
 * ></sky-rich-text-editor>
 */
export class SkyRichTextEditor extends LitElement {
  static override properties = {
    value: { type: String },
    placeholder: { type: String },
    label: { type: String },
    readOnly: { type: Boolean, attribute: 'readonly', reflect: true },
    _activeFormats: { state: true },
  };

  declare value: string;
  declare placeholder?: string;
  declare label?: string;
  declare readOnly: boolean;

  private declare _activeFormats: QuillFormats;
  private _quill: Quill | null = null;
  private _isInternalChange = false;

  constructor() {
    super();
    this.value = '';
    this.readOnly = false;
    this._activeFormats = {};
  }

  /** Light DOM — see the class doc comment for why. */
  protected override createRenderRoot(): this {
    return this;
  }

  /** The underlying Quill instance, for apps that need Delta access or other advanced APIs. */
  get quill(): Quill | null {
    return this._quill;
  }

  private readonly _onTextChange = (): void => {
    if (!this._quill) return;
    this._isInternalChange = true;
    this.value = this._quill.root.innerHTML;
    this._activeFormats = this._quill.getFormat(this._quill.getSelection() ?? undefined);
    this.dispatchEvent(
      new CustomEvent('sky-change', {
        detail: { html: this.value, text: this._quill.getText() },
        bubbles: true,
        composed: true,
      }),
    );
    this._isInternalChange = false;
  };

  private readonly _onSelectionChange = (range: { index: number; length: number } | null): void => {
    this._activeFormats = range && this._quill ? this._quill.getFormat(range) : {};
  };

  protected override firstUpdated(): void {
    ensureGlobalStyles();
    const editorEl = this.querySelector<HTMLDivElement>('.sky-rte-editor');
    if (!editorEl) return;

    this._quill = new Quill(editorEl, {
      placeholder: this.placeholder,
      readOnly: this.readOnly,
    });
    if (this.value) this._quill.root.innerHTML = this.value;
    this._quill.root.setAttribute('role', 'textbox');
    this._quill.root.setAttribute('aria-multiline', 'true');
    if (this.label) this._quill.root.setAttribute('aria-label', this.label);
    this._quill.on('text-change', this._onTextChange);
    this._quill.on('selection-change', this._onSelectionChange);
  }

  protected override updated(changed: PropertyValues): void {
    if (!this._quill) return;
    if (changed.has('value') && !this._isInternalChange) {
      const next = this.value ?? '';
      if (this._quill.root.innerHTML !== next) this._quill.root.innerHTML = next;
    }
    if (changed.has('readOnly')) this._quill.enable(!this.readOnly);
    if (changed.has('placeholder')) {
      if (this.placeholder) this._quill.root.setAttribute('data-placeholder', this.placeholder);
      else this._quill.root.removeAttribute('data-placeholder');
    }
    if (changed.has('label')) {
      if (this.label) this._quill.root.setAttribute('aria-label', this.label);
      else this._quill.root.removeAttribute('aria-label');
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._quill?.off('text-change', this._onTextChange);
    this._quill?.off('selection-change', this._onSelectionChange);
  }

  private _toggle(spec: ToggleSpec): void {
    if (!this._quill) return;
    const isActive = this._activeFormats[spec.format] === spec.value;
    this._quill.format(spec.format, isActive ? false : spec.value, 'user');
    this._quill.focus();
  }

  private _renderToggle(spec: ToggleSpec) {
    const active = this._activeFormats[spec.format] === spec.value;
    return html`
      <md-icon-button
        class="sky-rte-btn${active ? ' sky-rte-btn--active' : ''}"
        aria-label=${spec.label}
        aria-pressed=${active ? 'true' : 'false'}
        ?disabled=${this.readOnly}
        @click=${() => this._toggle(spec)}
      >
        <md-icon aria-hidden="true">${spec.icon}</md-icon>
      </md-icon-button>
    `;
  }

  private readonly _onLinkClick = (): void => {
    if (!this._quill) return;
    const range = this._quill.getSelection(true);
    if (!range) return;
    const existing = this._quill.getFormat(range).link as string | undefined;
    const url = window.prompt('Link URL', existing ?? 'https://');
    if (url === null) return;
    this._quill.format('link', url.trim() === '' ? false : url.trim(), 'user');
    this._quill.focus();
  };

  private readonly _onImageClick = (): void => {
    const url = window.prompt('Image URL', 'https://');
    if (url && url.trim()) this.insertImage(url.trim());
  };

  /** Public escape hatch: apps with their own upload flow call this once they have a URL. */
  insertImage(url: string): void {
    if (!this._quill) return;
    const range = this._quill.getSelection(true) ?? { index: this._quill.getLength(), length: 0 };
    this._quill.insertEmbed(range.index, 'image', url, 'user');
    this._quill.setSelection(range.index + 1, 0, 'user');
    this._quill.focus();
  }

  private readonly _onClearClick = (): void => {
    if (!this._quill) return;
    const range = this._quill.getSelection();
    if (!range) return;
    this._quill.removeFormat(range.index, range.length, 'user');
    this._quill.focus();
  };

  protected override render() {
    return html`
      <div class="sky-rte">
        <div class="sky-rte-toolbar" role="toolbar" aria-label="Formatting">
          ${INLINE_TOGGLES.map((s) => this._renderToggle(s))}
          <span class="sky-rte-sep" aria-hidden="true"></span>
          ${BLOCK_TOGGLES.map((s) => this._renderToggle(s))}
          <span class="sky-rte-sep" aria-hidden="true"></span>
          ${LIST_TOGGLES.map((s) => this._renderToggle(s))}
          <span class="sky-rte-sep" aria-hidden="true"></span>
          <md-icon-button
            class="sky-rte-btn"
            aria-label="Insert link"
            ?disabled=${this.readOnly}
            @click=${this._onLinkClick}
          >
            <md-icon aria-hidden="true">link</md-icon>
          </md-icon-button>
          <md-icon-button
            class="sky-rte-btn"
            aria-label="Insert image"
            ?disabled=${this.readOnly}
            @click=${this._onImageClick}
          >
            <md-icon aria-hidden="true">image</md-icon>
          </md-icon-button>
          <span class="sky-rte-sep" aria-hidden="true"></span>
          <md-icon-button
            class="sky-rte-btn"
            aria-label="Clear formatting"
            ?disabled=${this.readOnly}
            @click=${this._onClearClick}
          >
            <md-icon aria-hidden="true">format_clear</md-icon>
          </md-icon-button>
        </div>
        <div class="sky-rte-editor"></div>
      </div>
    `;
  }
}

if (!customElements.get('sky-rich-text-editor')) {
  customElements.define('sky-rich-text-editor', SkyRichTextEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    'sky-rich-text-editor': SkyRichTextEditor;
  }
}
