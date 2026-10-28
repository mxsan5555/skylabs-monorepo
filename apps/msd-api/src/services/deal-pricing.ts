/** Whole percent off, rounded down (docs/msd/PLANNING.md §2.7); null without a higher original
 *  price. The one discount rule for deal packages, the deal "from" cache and the deal page. */
export function discountOf(price: unknown, original: unknown): number | null {
  const sale = Number(price);
  const was = original == null ? null : Number(original);
  if (was === null || !(was > 0) || was <= sale) return null;
  return Math.floor(((was - sale) / was) * 100);
}
