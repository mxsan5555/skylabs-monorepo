import { prisma } from './prisma';

/**
 * Generates a globally-unique voucher code for one `PurchaseEntitlement` — backed by a real
 * Postgres sequence (`purchase_entitlement_voucher_seq`, created in this feature's migration),
 * so uniqueness is DB-guaranteed and no collision-retry loop is ever needed (unlike a
 * randomly-generated code, which would need a `findUnique` + retry dance under concurrency).
 * Base36-encoded (shorter, still unambiguous — no 0/O or 1/I confusion avoided deliberately by
 * using the full alphanumeric alphabet consistently) and prefixed by item kind so a code is
 * human-recognizable at a glance (`MSD-DL-…` deal, `MSD-TH-…` therapist, `MSD-PR-…` product). No
 * secret or customer data is ever encoded in the code itself.
 */
export type VoucherPrefix = 'DL' | 'TH' | 'PR';

export async function nextVoucherCode(prefix: VoucherPrefix): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('purchase_entitlement_voucher_seq') AS nextval`;
  const value = rows[0].nextval;
  return `MSD-${prefix}-${value.toString(36).toUpperCase()}`;
}
