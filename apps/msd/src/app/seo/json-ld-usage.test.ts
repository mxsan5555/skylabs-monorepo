import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('JSON-LD output', () => {
  // A raw `JSON.stringify` inside <script> does not escape `</script>`, so a member-supplied
  // name could close the tag and run script. Every page must go through <JsonLd>.
  it('is only written by the escaping <JsonLd> component', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join('seo', 'json-ld.tsx')))
      .filter((file) => /application\/ld\+json/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
