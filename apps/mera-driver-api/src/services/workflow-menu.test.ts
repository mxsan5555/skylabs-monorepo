import { describe,it,expect } from 'vitest';
import { filterMenuByPermissions } from '@skylabs-monorepo/shared-permissions';
import { workflowMenu,pruneEmptyMenuGroups } from './workflow-menu';
const flatten = (nodes: ReturnType<typeof workflowMenu>): ReturnType<typeof workflowMenu> => nodes.flatMap(n=>[n,...flatten(n.children??[])]);
describe('approved app navigation',()=>{
  it('keeps Accounts as one Overview entry and general reports separate',()=>{
    const menu=workflowMenu();expect(menu.map(n=>n.title)).toEqual(['Dashboard','Drivers & KYC','Customers','Trips & Bookings','Accounts','Promotions','Website & Support','Reports','Masters','Administration','Settings']);
    const all=flatten(menu);expect(all.filter(n=>n.title==='Reports').map(n=>n.route)).toEqual(['/reports']);expect(all.filter(n=>n.id==='accounts')).toHaveLength(1);expect(all.find(n=>n.id==='accounts')?.route).toBe('/accounts/overview');
    expect(all.some(n=>n.route==='/vehicles'||n.route==='/attendance')).toBe(false);
    expect(all.find(n=>n.title==='Driver Registry')?.route).toBe('/drivers');expect(all.find(n=>n.title==='Trips')?.route).toBe('/trips/bookings?view=trips');
    expect(all.find(n=>n.title==='Vehicle Types')?.route).toBe('/masters/vehicle-types');
    expect(all.find(n=>n.title==='Driver Verification Status')?.route).toBe('/masters/statuses');
    expect(all.find(n=>n.title==='Driver Account Statuses')?.route).toBe('/masters/driver-account-statuses');
  });
  it('does not display an empty group when only its heading is granted',()=>{
    expect(pruneEmptyMenuGroups(filterMenuByPermissions(workflowMenu(),['masters:view']))).toEqual([]);
  });
  it('retains all ancestors of an accessible nested master',()=>{
    const menu=pruneEmptyMenuGroups(filterMenuByPermissions(workflowMenu(),['masters.vehicle-types:view']));
    expect(menu[0].title).toBe('Masters');expect(menu[0].children?.[0].title).toBe('General');expect(menu[0].children?.[0].children?.[0].title).toBe('Vehicle Types');
  });
});
