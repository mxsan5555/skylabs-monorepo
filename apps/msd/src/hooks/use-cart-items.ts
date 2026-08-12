import { useCart } from '../cart/cart-context';
import { getDealById } from '../data/deals';
import { getProductById } from '../data/products';
import type { CartItem, Deal, Product } from '../types';

export type CartItemEntry =
    | {
        item: CartItem;
        type: 'deal';
        deal: Deal;
    }
    | {
        item: CartItem;
        type: 'product';
        product: Product;
    };

export function useCartItems() {
    const { items } = useCart();
    const cartItems: CartItemEntry[] = items
        .map((item) => {
            if (item.dealId) {
                const deal = getDealById(item.dealId);
                if (!deal) return null;
                return { item, type: 'deal' as const, deal, };
            }
            if (item.productId) {
                const product = getProductById(item.productId);
                if (!product) return null;
                return { item, type: 'product' as const, product, };
            }
            return null;
        })
        .filter((x): x is CartItemEntry => x !== null);
    const subtotal = cartItems.reduce((sum, entry) => {
        const price = entry.type === 'deal' ? entry.deal!.price : entry.product!.price;
        return sum + price * entry.item.quantity;
    }, 0);
    return { cartItems, subtotal, };
}