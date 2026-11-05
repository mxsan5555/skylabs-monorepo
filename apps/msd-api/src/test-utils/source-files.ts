import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Folders a source scan never enters: the generated Prisma client and installed packages. */
const SKIPPED = new Set(['generated', 'node_modules']);

/** `.ts` files under `dir` (recursive), leaving out tests and the skipped folders. */
export function listScripts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listScripts(path);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

/** Files under each of `dirs` whose source matches `pattern`, relative to `root`, for guard
 *  tests that ban a code pattern (raw SQL, cookies). */
export function filesMatching(root: string, dirs: string[], pattern: RegExp): string[] {
  return dirs
    .flatMap((dir) => listScripts(join(root, dir)))
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(root, file));
}
