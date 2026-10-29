import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { isComponentFile, listSourceFiles } from './testing/source-files';

/**
 * ST-04: one `<main>` per page. The layouts (public, auth, admin) render the page's `<main>`;
 * a page component nested inside one must use `div`, `article` or `section` instead, or the
 * page ends up with two main landmarks (WCAG 1.3.1, and the skip link loses its target).
 */
const PAGES = join(__dirname, 'app', 'pages');

describe('one main landmark per page (ST-04)', () => {
  it('no page component renders its own <main>; the layouts own it', () => {
    const offenders = listSourceFiles(PAGES, isComponentFile).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line, i) => ({ line, at: `${relative(PAGES, file)}:${i + 1}` }))
        .filter(({ line }) => /<main[\s>]/.test(line) || /createElement\(\s*['"]main['"]/.test(line))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });
});
