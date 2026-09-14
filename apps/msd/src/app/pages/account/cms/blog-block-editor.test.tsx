import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlogBlock } from '../../../../api/rbac/blog-posts';
import { BlogBlockEditor, sanitizeBlogBlocks } from './blog-block-editor';

const onChangeMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

/** Icon-button actions (`Move block earlier/later`, `Remove block`, `Add block`) are plain
 *  `<md-outlined-button>`s (not the `<md-outlined-select>` used for block type), so — unlike the
 *  Block type select, whose live value-change can't be reliably simulated under this jsdom +
 *  `@lit/react` + React 19 combination (see `categories.test.tsx`/`vendor-branches.test.tsx`'s
 *  own documented limitation) — `fireEvent.click` on these does reliably reach the handler. */
function clickByLabel(label: string, index = 0): void {
  const els = Array.from(document.querySelectorAll(`[aria-label="${label}"]`));
  const el = els[index];
  if (!el) throw new Error(`No element with aria-label "${label}" at index ${index}`);
  (el as HTMLElement).click();
}

/**
 * Feature: Blog block editor (paragraph/heading/list/quote)
 * Scenario: add/remove/reorder blocks produce the correct `BlogBlock[]` output, and each block
 * type renders its own sub-fields.
 *
 * Given: a `BlogBlock[]` and an `onChange` callback
 * When: the admin adds/removes/reorders a block, or a block's `type` differs
 * Then: `onChange` receives the correctly recomputed array; each type renders its matching field
 *
 * Edge cases:
 * - an empty `blocks` array renders the "No content blocks yet." empty state
 * - moving the first block earlier (or the last block later) is a structural no-op — the
 *   in-bounds guard in `move()` returns before ever calling `onChange`
 */
describe('BlogBlockEditor — add/remove/reorder', () => {
  it('renders the empty state with no blocks', () => {
    render(<BlogBlockEditor blocks={[]} onChange={onChangeMock} />);
    expect(screen.getByText('No content blocks yet.')).toBeTruthy();
  });

  it('Add block calls onChange with the existing blocks plus one new empty paragraph', () => {
    const blocks: BlogBlock[] = [{ type: 'paragraph', text: 'first' }];
    render(<BlogBlockEditor blocks={blocks} onChange={onChangeMock} />);
    const addButton = screen.getByText('Add block').closest('md-outlined-button') as HTMLElement;
    addButton.click();
    expect(onChangeMock).toHaveBeenCalledWith([...blocks, { type: 'paragraph', text: '' }]);
  });

  it('Remove block drops exactly the block at that row, leaving the rest untouched', () => {
    const blockA: BlogBlock = { type: 'paragraph', text: 'a' };
    const blockB: BlogBlock = { type: 'paragraph', text: 'b' };
    render(<BlogBlockEditor blocks={[blockA, blockB]} onChange={onChangeMock} />);
    clickByLabel('Remove block', 0);
    expect(onChangeMock).toHaveBeenCalledWith([blockB]);
  });

  it('Move later swaps a block with its next neighbor', () => {
    const blockA: BlogBlock = { type: 'paragraph', text: 'a' };
    const blockB: BlogBlock = { type: 'paragraph', text: 'b' };
    render(<BlogBlockEditor blocks={[blockA, blockB]} onChange={onChangeMock} />);
    clickByLabel('Move block later', 0);
    expect(onChangeMock).toHaveBeenCalledWith([blockB, blockA]);
  });

  it('Move earlier swaps a block with its previous neighbor', () => {
    const blockA: BlogBlock = { type: 'paragraph', text: 'a' };
    const blockB: BlogBlock = { type: 'paragraph', text: 'b' };
    render(<BlogBlockEditor blocks={[blockA, blockB]} onChange={onChangeMock} />);
    // Row 1 ("Move block earlier") is the second occurrence of that aria-label in document order.
    clickByLabel('Move block earlier', 1);
    expect(onChangeMock).toHaveBeenCalledWith([blockB, blockA]);
  });

  // Edge case: moving the very first block earlier is a structural no-op (move()'s own
  // `swapWith < 0` guard returns before calling onChange at all) — true regardless of whether the
  // button's `disabled` attribute is reliably reflected under jsdom (a documented gap for
  // @lit/react-wrapped Material components elsewhere in this suite), since the guard lives in
  // plain component logic, not in the disabled state blocking the click.
  it('moving the first block earlier is a no-op — onChange is never called', () => {
    const blockA: BlogBlock = { type: 'paragraph', text: 'a' };
    const blockB: BlogBlock = { type: 'paragraph', text: 'b' };
    render(<BlogBlockEditor blocks={[blockA, blockB]} onChange={onChangeMock} />);
    clickByLabel('Move block earlier', 0);
    expect(onChangeMock).not.toHaveBeenCalled();
  });

  it('moving the last block later is a no-op — onChange is never called', () => {
    const blockA: BlogBlock = { type: 'paragraph', text: 'a' };
    const blockB: BlogBlock = { type: 'paragraph', text: 'b' };
    render(<BlogBlockEditor blocks={[blockA, blockB]} onChange={onChangeMock} />);
    clickByLabel('Move block later', 1);
    expect(onChangeMock).not.toHaveBeenCalled();
  });
});

/**
 * Feature: Blog block editor — per-type sub-fields
 * Scenario: each block `type` (paragraph/heading/list/quote) renders its own matching field —
 * a single free-text field labeled per type, except `list`, which renders a multi-line
 * "Items (one per line)" field joining `items` with newlines instead of a single `text` field
 * (see `blog-block-editor.tsx`'s `block.type === 'list' ? ... : ...` branch).
 *
 * NOTE: `type` itself is driven by an `<md-outlined-select>`, whose live value-change interaction
 * can't be reliably simulated in this stack (see this file's `clickByLabel` doc comment) — so
 * rather than simulating a live type change, this suite renders one block of each type directly
 * via the `blocks` prop (exactly what `changeType`'s `emptyBlock(type)` call produces), which
 * exercises the exact same render branch either way.
 *
 * Further limitation confirmed empirically for this suite: none of `md-outlined-text-field`'s
 * non-default properties (`label`, `type`, `rows`, `value`) reliably read back through
 * `@lit/react`'s wrapper under this jsdom setup — a broader version of the same non-reflection
 * gap `settings.test.tsx`/`vendor-branches.test.tsx` already document for `value`/`disabled`.
 * So the per-type field differences (label wording, rows count) are verified by direct code
 * review of the ternary at `blog-block-editor.tsx` lines ~81-87, not by a DOM read here; this
 * suite instead verifies the one thing that *is* reliable — exactly one text field renders per
 * block, for every type, never one field per list item.
 */
describe('BlogBlockEditor — per-type sub-fields', () => {
  it.each([
    ['paragraph', { type: 'paragraph', text: 'Hello' }],
    ['heading', { type: 'heading', text: 'Hello' }],
    ['quote', { type: 'quote', text: 'Hello' }],
    ['list', { type: 'list', items: ['a', 'b'] }],
  ] as [string, BlogBlock][])('renders exactly one text field for a %s block', (_label, block) => {
    render(<BlogBlockEditor blocks={[block]} onChange={onChangeMock} />);
    expect(document.querySelectorAll('md-outlined-text-field').length).toBe(1);
  });
});

/**
 * Feature: sanitizeBlogBlocks — pre-submit cleanup
 * Scenario: called right before both the Blog Post form and the About Us page submit their
 * `body` field, so an in-progress blank line in a list (or a block left entirely empty) never
 * trips the backend's `min(1)` validation.
 *
 * Edge cases:
 * - a block whose only content is whitespace is dropped entirely (paragraph/heading/quote)
 * - a list with only blank/whitespace items collapses to zero items and is dropped
 */
describe('sanitizeBlogBlocks', () => {
  it('trims blank list items and drops empty text blocks, leaving well-formed content untouched', () => {
    const input: BlogBlock[] = [
      { type: 'paragraph', text: 'Real content' },
      { type: 'paragraph', text: '   ' },
      { type: 'list', items: ['first', '  ', ''] },
    ];
    expect(sanitizeBlogBlocks(input)).toEqual([
      { type: 'paragraph', text: 'Real content' },
      { type: 'list', items: ['first'] },
    ]);
  });

  it('drops a list block entirely once all its items are blank', () => {
    const input: BlogBlock[] = [{ type: 'list', items: ['   ', ''] }];
    expect(sanitizeBlogBlocks(input)).toEqual([]);
  });

  it('an already-empty input stays empty', () => {
    expect(sanitizeBlogBlocks([])).toEqual([]);
  });
});
