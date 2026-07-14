import { useCart } from '../cart/cart-context';
import { getDealById } from '../data/deals';
import type { CartItem, Deal } from '../types';

export interface CartDealEntry {
  item: CartItem;
  deal: Deal;
}

export function useCartDeals(): { cartDeals: CartDealEntry[]; subtotal: number } {
  const { items } = useCart();
  const cartDeals = items
    .map((item) => ({ item, deal: getDealById(item.dealId) }))
    .filter((x): x is CartDealEntry => !!x.deal);
  const subtotal = cartDeals.reduce(
    (sum, { item, deal }) => sum + deal.price * item.quantity,
    0,
  );
  return { cartDeals, subtotal };
}
