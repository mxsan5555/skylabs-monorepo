import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { listSourceFiles } from './testing/source-files';

/**
 * ST-19: the page content width (1280px) and its side gutter live in one place, the
 * `--sky-content-max` / `--sky-content-gutter` tokens on `:root` in styles.css. Every container
 * uses the tokens, so the width can never drift between the header, footer and page sections.
 */
const SRC = __dirname;
const TOKEN_FILE = join(SRC, 'styles.css');

describe('page content width token (ST-19)', () => {
  it('defines the width and gutter once, on :root in styles.css', () => {
    const css = readFileSync(TOKEN_FILE, 'utf8');
    expect(css).toMatch(/:root\s*\{[^}]*--sky-content-max:\s*1280px;/);
    expect(css).toMatch(/:root\s*\{[^}]*--sky-content-gutter:\s*16px;/);
  });

  it('never repeats 1280px outside the token', () => {
    const offenders = listSourceFiles(SRC, (name) => name.endsWith('.css')).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line, i) => ({ line, at: `${relative(SRC, file)}:${i + 1}` }))
        .filter(({ line }) => line.includes('1280px') && !line.includes('--sky-content-max:'))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });
});
