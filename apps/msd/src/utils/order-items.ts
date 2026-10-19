/** Minimal shape this grouping actually reads — both the self-service `OrderItem` (api/orders.ts)
 *  and the admin `OrderItem` (api/rbac/orders.ts) satisfy it structurally, so this one function
 *  serves the customer-facing Invoice page and the admin Customer→Order Invoice page alike. */
export interface GroupableOrderItem {
  id: string;
  vendorId: string;
  vendorNameSnapshot: string;
  /** Null when the item is a Product line — Product has no branch (see msd-api's Product schema
   *  doc comment). The admin `OrderItem` types this as plain `string`, which still satisfies
   *  `string | null` here. */
  branchNameSnapshot: string | null;
  itemName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  durationMinutes: number | null;
}

export interface OrderVendorGroup<T extends GroupableOrderItem = GroupableOrderItem> {
  vendorId: string;
  vendorName: string;
  /** Null when the group's first item is a Product line — Product has no branch (see msd-api's
   *  Product schema doc comment). */
  branchName: string | null;
  items: T[];
  subtotal: number;
}

/** Groups an Order's items by their own vendorId — for a single-vendor order (still the common
 *  case) this is just one group, identical to today's single-vendor display. Purely a display
 *  grouping: checkout/payment/order creation already operate on the flat `items[]`. */
export function groupOrderItemsByVendor<T extends GroupableOrderItem>(items: T[]): OrderVendorGroup<T>[] {
  const groups: OrderVendorGroup<T>[] = [];
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
