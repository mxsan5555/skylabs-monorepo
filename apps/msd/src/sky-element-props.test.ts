import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isComponentFile, listSourceFiles } from './testing/source-files';
import { describe, expect, it } from 'vitest';
import '@skylabs-monorepo/shared-ui';
import '@skylabs-monorepo/shared-ui/editor';

/**
 * Guards how the app passes props to shared-ui `sky-*` elements.
 *
 * Server rendering writes every custom-element prop as an attribute with the prop's own name, and
 * hydration does not set it again as a property. So `priceFirst` lands as `pricefirst`, which LIT
 * ignores: the prerendered page keeps the default. Props whose LIT attribute is kebab-case must be
 * written in that kebab form. Hyphenated JSX attributes are not type-checked, so this test also
 * rejects ones the element does not declare.
 */

const SRC = join(__dirname, 'app');
const PASS_THROUGH = new Set(['className', 'class', 'id', 'style', 'key', 'ref', 'slot', 'role', 'hidden', 'title', 'tabIndex', 'lang', 'dir', 'inert', 'part', 'children']);

const tsxFiles = (dir: string) => listSourceFiles(dir, isComponentFile);

/** Keys of the object literals in a `{...(cond ? { a, 'b-c': x } : {})}` spread. */
function spreadKeys(expr: string): string[] {
  return [...expr.matchAll(/(?:\?|\(|&&)\s*\{([^{}]*)/g)].flatMap((o) =>
    [...o[1].matchAll(/(?:^|,)\s*(?:'([\w-]+)'|([A-Za-z]\w*))\s*(?=[:,]|$)/g)].map((k) => k[1] ?? k[2]),
  );
}

/** Prop names of each `<sky-*>` opening tag, skipping quoted strings and `{...}` expressions. */
function skyTags(src: string): { tag: string; props: string[] }[] {
  const found: { tag: string; props: string[] }[] = [];
  for (const m of src.matchAll(/<(sky-[a-z-]+)(?=[\s>/])/g)) {
    let body = '';
    let expr = '';
    let depth = 0;
    let quote: string | null = null;
    const props: string[] = [];
    for (let i = (m.index ?? 0) + m[0].length; i < src.length; i++) {
      const c = src[i];
      if (depth) {
        if (c === '{') depth++;
        else if (c === '}' && !--depth) { if (expr.startsWith('...')) props.push(...spreadKeys(expr)); continue; }
        expr += c;
        continue;
      }
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; body += ' '; continue; }
      if (c === '{') { depth = 1; expr = ''; body += ' '; continue; }
      if (c === '>') break;
      body += c;
    }
    props.push(...[...body.replace(/\/$/, '').matchAll(/(?:^|\s)([A-Za-z][\w-]*)(?==|\s|$)/g)].map((p) => p[1]));
    found.push({ tag: m[1], props });
  }
  return found;
}

function attributesOf(tag: string) {
  const ctor = customElements.get(tag) as unknown as { elementProperties?: Map<string, { attribute?: string | boolean; state?: boolean }> } | undefined;
  const props = new Map<string, string | null>();
  for (const [name, opts] of ctor?.elementProperties ?? []) {
    if (opts.state) continue;
    props.set(name, opts.attribute === false ? null : typeof opts.attribute === 'string' ? opts.attribute : name.toLowerCase());
  }
  return props;
}

describe('sky-* element props in msd', () => {
  const problems: string[] = [];
  for (const file of tsxFiles(SRC)) {
    for (const { tag, props } of skyTags(readFileSync(file, 'utf8'))) {
      const known = attributesOf(tag);
      if (!known.size) continue;
      const attrs = new Set([...known.values()].filter(Boolean));
      const where = `${relative(SRC, file).replace(/\\/g, '/')} <${tag}>`;
      for (const prop of props) {
        if (PASS_THROUGH.has(prop) || /^(aria|data)-/.test(prop) || /^on(?:[A-Z]|sky-|md-)/.test(prop)) continue;
        if (prop.includes('-')) {
          if (!attrs.has(prop)) problems.push(`${where}: unknown attribute "${prop}"`);
        } else if (known.has(prop)) {
          const attr = known.get(prop);
          if (attr && attr !== prop.toLowerCase()) problems.push(`${where}: write "${prop}" as "${attr}"`);
        } else if (!attrs.has(prop)) {
          problems.push(`${where}: unknown prop "${prop}"`);
        }
      }
    }
  }

  it('uses only declared props, in the form that survives prerendering', () => {
    if (problems.length) console.log(problems.join('\n'));
    expect(problems).toEqual([]);
  });
});
