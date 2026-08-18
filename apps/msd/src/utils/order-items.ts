import type { OrderItem } from '../api/orders';

export interface OrderVendorGroup {
  vendorId: string;
  vendorName: string;
  branchName: string;
  items: OrderItem[];
  subtotal: number;
}

/** Groups an Order's items by their own vendorId — for a single-vendor order (still the common
 *  case) this is just one group, identical to today's single-vendor display. Purely a display
 *  grouping: checkout/payment/order creation already operate on the flat `items[]`. */
export function groupOrderItemsByVendor(items: OrderItem[]): OrderVendorGroup[] {
  const groups: OrderVendorGroup[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.vendorId === item.vendorId);
    const lineTotal = Number(item.lineTotal);
    if (group) {
      group.items.push(item);
      group.subtotal += lineTotal;
    } else {
      groups.push({
        vendorId: item.vendorId,
        vendorName: item.vendorNameSnapshot,
        branchName: item.branchNameSnapshot,
        items: [item],
        subtotal: lineTotal,
      });
    }
  }
  return groups;
}
