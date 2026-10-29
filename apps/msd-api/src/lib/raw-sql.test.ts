import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * P11-03: raw SQL only through Prisma's tagged `$queryRaw` / `$executeRaw` (values become bind
 * parameters). The `*Unsafe` variants and `Prisma.raw` take a plain string, so a value could be
 * concatenated into SQL; they are not allowed anywhere in the API or its Prisma scripts.
 */
const API_ROOT = join(__dirname, '../..');
const SCANNED = ['src', 'prisma'];
const UNSAFE_SQL = /\$(?:queryRawUnsafe|executeRawUnsafe)\b|Prisma\.raw\(/;

const isScript = (name: string) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name);

function listScripts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'generated' || entry.name === 'node_modules') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listScripts(path) : isScript(entry.name) ? [path] : [];
  });
}

describe('raw SQL (P11-03)', () => {
  it('never uses a string-built raw query', () => {
    const offenders = SCANNED.flatMap((dir) => listScripts(join(API_ROOT, dir)))
      .filter((file) => UNSAFE_SQL.test(readFileSync(file, 'utf8')))
      .map((file) => relative(API_ROOT, file));
    expect(offenders).toEqual([]);
  });
});
