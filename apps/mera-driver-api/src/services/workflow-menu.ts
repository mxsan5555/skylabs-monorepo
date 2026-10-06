import { getMenuForApp } from '@skylabs-monorepo/shared-menu';

/** App-scoped extension; reuse existing permission keys and leave shared menus intact. */
export function workflowMenu() {
  const menu = getMenuForApp('mera-driver').filter(item=>item.id!=='payments-group');
  const masterLinks=['Job Types','Job Choices','Work States','Driver Statuses'].map((title,i)=>({id:'driver-preferences-'+i,title,icon:'list',route:'/masters/'+['job-types','job-choices','states','driver-account-statuses'][i],permissionKey:'masters.source-types',parent:null,order:30+i}));
  return [...menu,...masterLinks, { id: 'dispatch', title: 'Admin Dispatch', icon: 'route', route: '/dispatch', permissionKey: 'trips.bookings', parent: null, order: 5 },
    { id: 'accounts', title: 'Accounts', icon: 'account_balance', permissionKey: 'payments.overview', parent: null, order: 6,
      children: ['Overview','Booking Payments','Registration Fees','Commissions','Driver Payouts','Refunds & Adjustments','Reports'].map((title, i) => ({
        id: `accounts-${i}`, title, icon: 'payments', route: `/accounts/${['overview','booking-payments','registration-fees','commissions','driver-payouts','refunds-adjustments','reports'][i]}`, permissionKey: 'payments.overview', parent: 'accounts', order: i + 1 })) }];
}
