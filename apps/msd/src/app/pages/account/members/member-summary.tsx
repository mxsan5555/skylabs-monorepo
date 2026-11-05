import { useId } from 'react';
import type { Vendor } from '../../../../api/rbac/vendors';
import { StatTile, type StatTileProps } from '../../../components/stat-tile/stat-tile';
import { MEMBER_STATUS_LABEL, documentsState, dueDateLabel } from './member-status';
import { pluralize } from '../../../../utils/format';

const count = (n: number | undefined) => (n ?? 0).toLocaleString('en-IN');

const CATALOG = [
  { key: 'branches', label: 'Branches', icon: 'location_on' },
  { key: 'deals', label: 'Deals', icon: 'local_offer' },
  { key: 'therapists', label: 'Therapists', icon: 'spa' },
  { key: 'products', label: 'Products', icon: 'inventory_2' },
] as const;

export interface MemberSummaryProps {
  member: Vendor;
  /** Tabs the viewer can open; a card links to its tab only when it is one of them. */
  tabs: readonly string[];
  /** Whether the viewer may open the orders list (`orders:view`). */
  canOpenOrders: boolean;
}

/**
 * The member page's overview (item 7): dashboard-style cards before the tabs, so staff see the
 * member's state at once: status, documents, branches, deals, therapists and products (all, with
 * how many are live), customers and orders. Each card opens its tab when the viewer can.
 */
export function MemberSummary({ member, tabs, canOpenOrders }: MemberSummaryProps) {
  const headingId = useId();
  const tabLink = (tab: string) => (tabs.includes(tab) ? `/account/members/${member.id}/${tab}` : undefined);
  const documentsComplete = documentsState(member.documentsSummary) === 'complete';

  const cards: (StatTileProps & { key: string })[] = [
    {
      key: 'status',
      icon: 'verified_user',
      value: MEMBER_STATUS_LABEL[member.status],
      label: 'Status',
    },
    {
      key: 'documents',
      icon: documentsComplete ? 'task' : 'pending_actions',
      value: documentsComplete ? 'Complete' : 'Incomplete',
      label: 'Documents',
      ...(dueDateLabel(member.documentsSummary) ? { detail: dueDateLabel(member.documentsSummary) } : {}),
      to: tabLink('documents'),
    },
    ...CATALOG.map(({ key, label, icon }) => ({
      key,
      icon,
      value: count(member._count?.[key]),
      label,
      ...(member.liveCounts ? { detail: `${count(member.liveCounts[key])} live` } : {}),
      to: tabLink(key),
    })),
    {
      key: 'customers',
      icon: 'groups',
      value: count(member.customerCount),
      label: pluralize(member.customerCount ?? 0, 'Customer'),
      to: tabLink('customers'),
    },
    {
      key: 'orders',
      icon: 'shopping_bag',
      value: count(member.orderCount),
      label: pluralize(member.orderCount ?? 0, 'Order'),
      to: canOpenOrders ? `/account/orders?vendorId=${member.id}` : undefined,
    },
  ];

  return (
    <section className="member-summary" aria-labelledby={headingId}>
      <h2 id={headingId} className="title-medium">
        Overview
      </h2>
      <ul className="dashboard-stats">
        {cards.map(({ key, ...card }) => (
          <li key={key}>
            <StatTile {...card} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default MemberSummary;
