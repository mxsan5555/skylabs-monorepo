import { installMaterialJsdomPolyfills } from '../../testing/index.js';
import './sky-rich-text-editor.js';
import { SkyRichTextEditor } from './sky-rich-text-editor.js';

installMaterialJsdomPolyfills();

async function create(props: Partial<SkyRichTextEditor> = {}): Promise<SkyRichTextEditor> {
  const el = document.createElement('sky-rich-text-editor') as SkyRichTextEditor;
  Object.assign(el, props);
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

const toolbarButton = (el: SkyRichTextEditor, label: string) =>
  el.querySelector(`md-icon-button[aria-label="${label}"]`) as HTMLElement;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('sky-rich-text-editor', () => {
  it('renders into light DOM (no shadow root)', async () => {
    const el = await create();
    expect(el.shadowRoot).toBeNull();
    expect(el.querySelector('.sky-rte-toolbar')).not.toBeNull();
    expect(el.querySelector('.sky-rte-editor')).not.toBeNull();
  });

  it('seeds the editable region from the initial value', async () => {
    const el = await create({ value: '<p>Hello world</p>' });
    expect(el.querySelector('.sky-rte-editor')?.innerHTML).toContain('Hello world');
  });

  it('applies the placeholder as data-placeholder on the Quill root', async () => {
    const el = await create({ placeholder: 'Write something' });
    expect(el.quill?.root.getAttribute('data-placeholder')).toBe('Write something');
  });

  it('reflects readonly and disables every toolbar button', async () => {
    const el = await create({ readOnly: true });
    expect(el.hasAttribute('readonly')).toBe(true);
    const buttons = el.querySelectorAll('md-icon-button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => expect(b.hasAttribute('disabled')).toBe(true));
  });

  it('fires sky-change with html + text on edits', async () => {
    const el = await create();
    const onChange = vi.fn();
    el.addEventListener('sky-change', onChange);
    el.quill?.setText('hot stone massage');
    await el.updateComplete;
    expect(onChange).toHaveBeenCalled();
    const detail = (onChange.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.text).toContain('hot stone massage');
    expect(detail.html).toBe(el.value);
  });

  it('toggles bold on the current selection via the toolbar', async () => {
    const el = await create({ value: '<p>hello</p>' });
    el.quill?.setSelection(0, 5);
    await el.updateComplete;
    toolbarButton(el, 'Bold').click();
    expect(el.quill?.getFormat(0, 5).bold).toBe(true);
  });

  it('inserts an image embed via the public insertImage() API', async () => {
    const el = await create({ value: '<p>hello</p>' });
    el.quill?.setSelection(5, 0);
    el.insertImage('https://example.com/spa.jpg');
    const img = el.querySelector('.sky-rte-editor img');
    expect(img?.getAttribute('src')).toBe('https://example.com/spa.jpg');
  });

  it('clears formatting on the current selection', async () => {
    const el = await create({ value: '<p><strong>hello</strong></p>' });
    el.quill?.setSelection(0, 5);
    await el.updateComplete;
    toolbarButton(el, 'Clear formatting').click();
    expect(el.quill?.getFormat(0, 5).bold).toBeFalsy();
  });
});
