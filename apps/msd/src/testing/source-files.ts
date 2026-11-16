import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Files under `dir` (recursive) whose name passes `accept`, for tests that scan the source
 *  (one `<main>` per page, the content width token, JSON-LD output, sky-element props). */
export function listSourceFiles(dir: string, accept: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listSourceFiles(join(dir, entry.name), accept) : accept(entry.name) ? [join(dir, entry.name)] : [],
  );
}

/** `.ts` / `.tsx` source files, leaving out tests. */
export const isSourceFile = (name: string) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name);

/** `.tsx` components, leaving out tests. */
export const isComponentFile = (name: string) => name.endsWith('.tsx') && !name.endsWith('.test.tsx');
