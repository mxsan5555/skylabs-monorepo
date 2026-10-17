import { prisma } from '../lib/prisma';

export type MemberAccessState =
  | { kind: 'none' }
  | { kind: 'ok' }
  | { kind: 'readOnly' }
  | { kind: 'blocked'; reason: string | null };

type MemberStatusRow = { status: string; statusReason: string | null } | null | undefined;

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; state: MemberAccessState }>();

/** Maps a member row to its access state. No row (null or undefined) means the user owns no member business. */
export function memberAccessStateFor(member: MemberStatusRow): MemberAccessState {
  if (!member) return { kind: 'none' };
  if (member.status === 'SUSPENDED' || member.status === 'ARCHIVED') {
    return { kind: 'blocked', reason: member.statusReason ?? null };
  }
  if (member.status === 'INACTIVE') return { kind: 'readOnly' };
  return { kind: 'ok' };
}

/** Reads the member status of the business the user owns, without the cache. Login and OTP request use this. */
export async function readMemberAccessState(userId: string): Promise<MemberAccessState> {
  const member = await prisma.member.findUnique({
    where: { ownerUserId: userId },
    select: { status: true, statusReason: true },
  });
  return memberAccessStateFor(member);
}

/**
 * Reads the owner's member status with a 30 second cache, for `authenticate`. Every status
 * change must call `clearMemberAccessCache(ownerUserId)` so a suspension takes effect at once
 * on this instance.
 */
export async function getMemberAccessState(userId: string, now: number = Date.now()): Promise<MemberAccessState> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.state;

  const state = await readMemberAccessState(userId);
  cache.set(userId, { at: now, state });
  return state;
}

export function clearMemberAccessCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
