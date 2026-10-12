import { getMenuForApp } from '@skylabs-monorepo/shared-menu';
import type { MenuNode } from '@skylabs-monorepo/shared-types';

/** App-owned navigation; historical permissions and API capabilities remain intact. */
export function workflowMenu(): MenuNode[] {
  const flatten = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap(n => [n, ...flatten(n.children ?? [])]);
  const source = flatten(getMenuForApp('mera-driver'));
  const link = (id: string, title?: string): MenuNode => {
    const node = source.find(n => n.id === id);
    if (!node) throw new Error(`Missing existing menu destination: ${id}`);
    return { ...node, ...(title ? { title } : {}), children: undefined };
  };
  const group = (id: string, title: string, icon: string, children: MenuNode[]): MenuNode => ({
    id, title, icon, permissionKey: id, parent: null, order: 0,
    children: children.map((n, i) => ({ ...n, parent: id, order: i + 1 })),
  });
  const preference = (title: string, route: string): MenuNode => ({ id: `preference-${route}`, title, icon: 'list', route: `/masters/${route}`, permissionKey: 'masters.source-types', parent: null, order: 0 });
  return [
    link('dashboard'),
    group('drivers-group', 'Drivers & KYC', 'sports_motorsports', [link('drivers', 'Driver Registry'), { ...link('drivers', 'Driver Users'), id: 'driver-users', route: '/drivers?view=users' }, link('kyc-assignments')]),
    link('customers'),
    group('trips-group', 'Trips & Bookings', 'route', [link('trips-bookings'), { ...link('trips-bookings', 'Admin Dispatch'), id: 'dispatch', route: '/dispatch' }, { ...link('trips-bookings','Trips'), id:'trips-list',route:'/trips/bookings?view=trips' }, link('pricing')]),
    { id:'accounts', title:'Accounts', icon:'account_balance', route:'/accounts/overview', permissionKey:'payments.overview', parent:null },
    group('promotions-group', 'Promotions', 'local_offer', [link('promotions-promo-codes'), link('promotions-promo-usage')]),
    group('website-support', 'Website & Support', 'support_agent', [link('faqs'), link('feedback')]),
    link('reports'),
    group('masters', 'Masters', 'category', [
      group('masters-work', 'Driver & Work', 'badge', [link('masters-driver-types'), link('masters-statuses', 'Driver Verification Status'), preference('Driver Account Statuses', 'driver-account-statuses'), preference('Job Types','job-types'), preference('Job Choices','job-choices'), preference('Work States','states')]),
      group('masters-documents', 'Documents & KYC', 'description', [link('masters-personal-docs'),link('masters-education'),link('masters-eye-visions'),link('masters-health-docs'),link('masters-police-docs')]),
      group('masters-general', 'General', 'category', [link('masters-vehicle-types'),link('masters-zones'),link('masters-source-types'),link('masters-languages')]),
    ]),
    source.find(n => n.id === 'administration')!,
    link('settings'),
  ].map((n, i) => ({ ...n, order: i + 1 }));
}

export function pruneEmptyMenuGroups(nodes: MenuNode[]): MenuNode[] {
  return nodes.flatMap(node => {
    if (!node.children) return node.route ? [node] : [];
    const children = pruneEmptyMenuGroups(node.children);
    return children.length ? [{ ...node, children }] : [];
  });
}
