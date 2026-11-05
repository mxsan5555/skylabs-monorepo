import type { BlogBlock } from '../../../types';

/** One CMS body block as its semantic element. Used by the public blog post, the admin post
 *  preview and every static page (`Prose`); the admin `BlogBlock` type has the same shape. */
export function renderBlock(block: BlogBlock, i: number) {
  switch (block.type) {
    case 'heading':
      return <h2 key={i}>{block.text}</h2>;
    case 'list':
      return (
        <ul key={i}>
          {block.items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
    case 'quote':
      return <blockquote key={i}>{block.text}</blockquote>;
    default:
      return <p key={i}>{block.text}</p>;
  }
}
