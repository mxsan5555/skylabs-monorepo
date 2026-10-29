import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesMatching } from '../test-utils/source-files';

/**
 * P11-03: raw SQL only through Prisma's tagged `$queryRaw` / `$executeRaw` (values become bind
 * parameters). The `*Unsafe` variants and `Prisma.raw` take a plain string, so a value could be
 * concatenated into SQL; they are not allowed anywhere in the API or its Prisma scripts.
 */
const API_ROOT = join(__dirname, '../..');
const UNSAFE_SQL = /\$(?:queryRawUnsafe|executeRawUnsafe)\b|Prisma\.raw\(/;

describe('raw SQL (P11-03)', () => {
  it('never uses a string-built raw query', () => {
    expect(filesMatching(API_ROOT, ['src', 'prisma'], UNSAFE_SQL)).toEqual([]);
  });
});
