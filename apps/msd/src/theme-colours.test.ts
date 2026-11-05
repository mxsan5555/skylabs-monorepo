import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';
import { isSourceFile, listSourceFiles } from './testing/source-files';

/**
 * ST-16: app code takes every colour from the generated M3 theme (`--md-sys-color-*` roles and
 * the shared-ui `--sky-elevation-*` shadows), so the dark and contrast themes the footer switch
 * applies reach every screen. A literal colour (or a light-theme fallback inside `var()`) stays
 * light in the dark theme. Only the generated theme files under `assets/theme` hold values.
 */
const SRC = __dirname;
const THEME_DIR = join(SRC, 'assets', 'theme') + sep;

const CSS_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|:\s*(?:white|black)\s*;/;
const TS_HEX = /['"`]#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})['"`]/;

function offenders(accept: (name: string) => boolean, pattern: RegExp): string[] {
  return listSourceFiles(SRC, accept)
    .filter((file) => !file.startsWith(THEME_DIR))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line, i) => ({ line, at: `${relative(SRC, file)}:${i + 1}` }))
        .filter(({ line }) => pattern.test(line))
        .map(({ at }) => at),
    );
}

describe('theme colours only (ST-16)', () => {
  it('app CSS has no literal colours or light fallbacks', () => {
    expect(offenders((name) => name.endsWith('.css'), CSS_COLOUR)).toEqual([]);
  });

  it('app TypeScript has no hex colour strings', () => {
    expect(offenders(isSourceFile, TS_HEX)).toEqual([]);
  });
});
