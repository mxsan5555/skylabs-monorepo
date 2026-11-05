import { prisma } from '../lib/prisma';

/** Display names for a set of user ids, in one query (none when there are no ids). Used for
 *  "by <name>" labels on activity, reminders and documents. Unknown ids are simply absent. */
export async function userNamesById(ids: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}
