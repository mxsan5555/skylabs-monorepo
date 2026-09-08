import { OutlinedButton, OutlinedSelect, OutlinedTextField, SelectOption, Icon } from '@skylabs-monorepo/shared-ui/react';
import type { BlogBlock } from '../../../../api/rbac/blog-posts';

const BLOCK_TYPE_OPTIONS: { value: BlogBlock['type']; label: string }[] = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'heading', label: 'Heading' },
  { value: 'list', label: 'List' },
  { value: 'quote', label: 'Quote' },
];

function emptyBlock(type: BlogBlock['type']): BlogBlock {
  return type === 'list' ? { type, items: [''] } : { type, text: '' };
}

/**
 * Repeatable body-block editor for a `BlogBlock[]` (paragraph/heading/list/quote) — used by both
 * the Blog Post form dialog and the About Us page (both have a `body: BlogBlock[]` field). Not a
 * new shared-ui component — built only from existing primitives (`OutlinedSelect`/
 * `OutlinedTextField`/`OutlinedButton`), kept local to the CMS module per this task's own
 * constraint. Add/remove/reorder mirrors `MediaUploader`'s own image reorder icon-button
 * convention (`arrow_upward`/`arrow_downward`/`delete` icon buttons).
 */
export function BlogBlockEditor({
  blocks,
  onChange,
}: {
  blocks: BlogBlock[];
  onChange: (blocks: BlogBlock[]) => void;
}) {
  const update = (i: number, block: BlogBlock) => onChange(blocks.map((b, idx) => (idx === i ? block : b)));
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i));
  const move = (i: number, direction: -1 | 1) => {
    const swapWith = i + direction;
    if (swapWith < 0 || swapWith >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[swapWith]] = [next[swapWith], next[i]];
    onChange(next);
  };
  const add = () => onChange([...blocks, emptyBlock('paragraph')]);
  const changeType = (i: number, type: BlogBlock['type']) => update(i, emptyBlock(type));

  return (
    <fieldset className="block-editor">
      <legend>Body</legend>
      {blocks.length === 0 && <p className="empty-state">No content blocks yet.</p>}
      {blocks.map((block, i) => (
        <div className="block-editor__row" key={i}>
          <div className="block-editor__row-head">
            <OutlinedSelect
              label="Block type"
              value={block.type}
              onChange={(e: Event) => changeType(i, (e.target as HTMLSelectElement).value as BlogBlock['type'])}
            >
              {BLOCK_TYPE_OPTIONS.map((opt) => (
                <SelectOption key={opt.value} value={opt.value}>
                  <div slot="headline">{opt.label}</div>
                </SelectOption>
              ))}
            </OutlinedSelect>
            <div className="block-editor__row-actions">
              <OutlinedButton onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move block earlier">
                <Icon slot="icon" aria-hidden="true">arrow_upward</Icon>
              </OutlinedButton>
              <OutlinedButton onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move block later">
                <Icon slot="icon" aria-hidden="true">arrow_downward</Icon>
              </OutlinedButton>
              <OutlinedButton onClick={() => remove(i)} aria-label="Remove block">
                <Icon slot="icon" aria-hidden="true">delete</Icon>
              </OutlinedButton>
            </div>
          </div>
          {block.type === 'list' ? (
            <OutlinedTextField
              label="Items (one per line)"
              type="textarea"
              rows={4}
              value={block.items.join('\n')}
              onInput={(e: Event) => update(i, { type: 'list', items: (e.target as HTMLTextAreaElement).value.split('\n') })}
            />
          ) : (
            <OutlinedTextField
              label={block.type === 'heading' ? 'Heading text' : block.type === 'quote' ? 'Quote text' : 'Paragraph text'}
              type="textarea"
              rows={block.type === 'heading' ? 2 : 4}
              value={block.text}
              onInput={(e: Event) => update(i, { ...block, text: (e.target as HTMLTextAreaElement).value })}
            />
          )}
        </div>
      ))}
      <OutlinedButton onClick={add}>
        <Icon slot="icon" aria-hidden="true">add</Icon>
        Add block
      </OutlinedButton>
    </fieldset>
  );
}

/** Drops blank list items and drops any block left entirely empty — called right before submit
 *  so the user can freely type multi-line list text (including blank in-progress lines) without
 *  the backend's `min(1)` block/item validation rejecting the request. Exported so both the Blog
 *  Post form and the About Us page apply the exact same sanitize step to their `body` field. */
export function sanitizeBlogBlocks(blocks: BlogBlock[]): BlogBlock[] {
  return blocks
    .map((block) => (block.type === 'list' ? { ...block, items: block.items.map((i) => i.trim()).filter(Boolean) } : block))
    .filter((block) => (block.type === 'list' ? block.items.length > 0 : block.text.trim().length > 0));
}

export default BlogBlockEditor;
